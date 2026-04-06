import { useState, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════
   秘書AIエージェント
   Gmail → AI解析 → Google Calendar 自動登録
   ═══════════════════════════════════════════════════ */

const P = {
  bg:"#04070e",surface:"#0a1019",card:"#0f1825",card2:"#152030",
  border:"#192840",text:"#e6ecf4",sub:"#9db2ca",muted:"#5d7189",dim:"#3d5068",
  pri:"#f472b6",gmail:"#ea4335",gcal:"#4285f4",green:"#34d399",orange:"#fbbf24",
  red:"#f87171",cyan:"#22d3ee",purple:"#a78bfa",
};

const SK="secretary-agent-v1";
const loadS=async()=>{try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):null;}catch{return null;}};
const saveS=async d=>{try{await window.storage.set(SK,JSON.stringify(d));}catch(e){console.error(e);}};

const callAI=async(msgs,sys,mcpServers,tools)=>{
  const body={model:"claude-sonnet-4-20250514",max_tokens:4096,system:sys,messages:msgs};
  if(mcpServers)body.mcp_servers=mcpServers;
  if(tools)body.tools=tools;
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return await r.json();
};

const MCP_GMAIL={type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"};
const MCP_GCAL={type:"url",url:"https://gcal.mcp.claude.com/mcp",name:"gcal"};

const pJ=t=>{try{return JSON.parse(t.replace(/```json|```/g,"").trim());}catch{return null;}};

const Badge=({text,color})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600,background:`${color}20`,color,whiteSpace:"nowrap"}}>{text}</span>;

const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);

/* ═══ EXTRACT TEXT FROM API RESPONSE ═══ */
const extractText=(content)=>{
  if(!content||!Array.isArray(content))return"";
  return content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
};

const extractToolResults=(content)=>{
  if(!content||!Array.isArray(content))return[];
  return content.filter(b=>b.type==="mcp_tool_result").map(b=>{
    try{return b.content?.[0]?.text||"";}catch{return"";}
  });
};

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function SecretaryAgent(){
  const [view,setView]=useState("inbox"); // inbox | schedule | log
  const [data,setData]=useState({events:[],log:[],processedEmails:[]});
  const [loaded,setLoaded]=useState(false);
  const [emails,setEmails]=useState([]);
  const [fetchingMail,setFetchingMail]=useState(false);
  const [analyzing,setAnalyzing]=useState(null);
  const [schedulingId,setSchedulingId]=useState(null);
  const [pendingEvents,setPendingEvents]=useState([]);
  const [step,setStep]=useState("");
  const [calEvents,setCalEvents]=useState([]);
  const [fetchingCal,setFetchingCal]=useState(false);

  useEffect(()=>{(async()=>{const s=await loadS();if(s)setData(s);setLoaded(true);})();},[]);
  useEffect(()=>{if(loaded)saveS(data);},[data,loaded]);

  /* ─── FETCH GMAIL ─── */
  const fetchEmails=async()=>{
    setFetchingMail(true);setStep("Gmailからメールを取得中...");
    try{
      const resp=await callAI(
        [{role:"user",content:"受信トレイの最新メールを10件取得してください。各メールについて、件名、送信者、日時、本文の概要を教えてください。"}],
        "あなたはGmailアシスタントです。ユーザーの受信トレイからメールを取得し、その内容を報告してください。",
        [MCP_GMAIL]
      );
      const text=extractText(resp.content);
      const toolResults=extractToolResults(resp.content);

      // Parse with AI
      const parseResp=await callAI(
        [{role:"user",content:`以下のGmailデータからメール一覧を抽出してJSONで返してください:\n\nテキスト:\n${text}\n\nツール結果:\n${toolResults.join("\n")}`}],
        `メール解析AI。JSONのみ返答。{"emails":[{"id":"メールID(なければ連番)","subject":"件名","from":"送信者","date":"日時","snippet":"本文の概要(100字以内)","has_schedule_info":true/false}]}`
      );
      const parsed=pJ(extractText(parseResp.content));
      if(parsed?.emails){setEmails(parsed.emails);}
      else{setEmails([{id:"1",subject:"取得結果",from:"Gmail",date:today(),snippet:text.slice(0,200),has_schedule_info:false}]);}
    }catch(e){
      console.error(e);
      setEmails([{id:"err",subject:"メール取得エラー",from:"System",date:today(),snippet:"Gmailへの接続に失敗しました。Gmail MCPが接続されているか確認してください。",has_schedule_info:false}]);
    }
    setFetchingMail(false);setStep("");
  };

  /* ─── ANALYZE EMAIL FOR SCHEDULE ─── */
  const analyzeEmail=async(email)=>{
    setAnalyzing(email.id);setStep("メール内容をAIが解析中...");
    try{
      // Get full email content via Gmail MCP
      const fullResp=await callAI(
        [{role:"user",content:`次のメールの全文を取得してください: 件名「${email.subject}」送信者「${email.from}」`}],
        "Gmailアシスタントです。指定されたメールの全文を取得してください。",
        [MCP_GMAIL]
      );
      const fullText=extractText(fullResp.content)+"\n"+extractToolResults(fullResp.content).join("\n");

      // Extract schedule info with AI
      const analyzeResp=await callAI(
        [{role:"user",content:`以下のメール内容から、予定・スケジュール情報を全て抽出してください:\n\n件名: ${email.subject}\n送信者: ${email.from}\n日時: ${email.date}\n\n本文:\n${fullText}`}],
        `スケジュール抽出AI。メールから予定を抽出してJSONのみ返答。予定が無い場合は空配列。
{"events":[{"title":"予定タイトル","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":"場所(あれば)","description":"詳細","attendees":"参加者(あれば)","source_email":"元メール件名","confidence":"high/medium/low"}],"no_schedule_reason":"予定がない場合の理由"}`
      );
      const parsed=pJ(extractText(analyzeResp.content));
      if(parsed?.events?.length>0){
        const newPending=parsed.events.map(ev=>({...ev,id:uid(),emailId:email.id,emailSubject:email.subject,status:"pending"}));
        setPendingEvents(prev=>[...newPending,...prev]);
      }else{
        setPendingEvents(prev=>[{id:uid(),title:"予定なし",date:"-",start_time:"-",end_time:"-",description:parsed?.no_schedule_reason||"このメールにスケジュール情報は含まれていません",status:"no_event",emailSubject:email.subject},...prev]);
      }
    }catch(e){console.error(e);}
    setAnalyzing(null);setStep("");
  };

  /* ─── REGISTER TO GOOGLE CALENDAR ─── */
  const registerEvent=async(event)=>{
    setSchedulingId(event.id);setStep("Googleカレンダーに登録中...");
    try{
      const resp=await callAI(
        [{role:"user",content:`以下の予定をGoogleカレンダーに登録してください:\nタイトル: ${event.title}\n日付: ${event.date}\n開始: ${event.start_time}\n終了: ${event.end_time}\n場所: ${event.location||"なし"}\n詳細: ${event.description||""}\n参加者: ${event.attendees||"なし"}`}],
        "Googleカレンダーアシスタントです。指定された予定をカレンダーに登録してください。",
        [MCP_GCAL]
      );
      const resultText=extractText(resp.content);

      // Update status
      setPendingEvents(prev=>prev.map(e=>e.id===event.id?{...e,status:"registered",calResult:resultText}:e));
      setData(prev=>({...prev,
        events:[{...event,status:"registered",registeredAt:new Date().toISOString()},...(prev.events||[])],
        log:[{id:uid(),action:"カレンダー登録",detail:`${event.title} (${event.date} ${event.start_time})`,timestamp:new Date().toLocaleString("ja-JP")},...(prev.log||[]).slice(0,99)],
      }));
    }catch(e){
      console.error(e);
      setPendingEvents(prev=>prev.map(ev=>ev.id===event.id?{...ev,status:"error"}:ev));
    }
    setSchedulingId(null);setStep("");
  };

  /* ─── REGISTER ALL PENDING ─── */
  const registerAll=async()=>{
    const toRegister=pendingEvents.filter(e=>e.status==="pending");
    for(const ev of toRegister){await registerEvent(ev);}
  };

  /* ─── FETCH CALENDAR ─── */
  const fetchCalendar=async()=>{
    setFetchingCal(true);setStep("Googleカレンダーの予定を取得中...");
    try{
      const resp=await callAI(
        [{role:"user",content:`今日(${today()})から1週間の予定を全て取得してください。`}],
        "Googleカレンダーアシスタントです。指定期間の予定を取得してください。",
        [MCP_GCAL]
      );
      const text=extractText(resp.content)+"\n"+extractToolResults(resp.content).join("\n");
      const parseResp=await callAI(
        [{role:"user",content:`以下のカレンダーデータから予定一覧をJSONで返してください:\n${text}`}],
        `カレンダー解析AI。JSONのみ。{"events":[{"title":"予定名","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":"場所"}]}`
      );
      const parsed=pJ(extractText(parseResp.content));
      if(parsed?.events)setCalEvents(parsed.events);
    }catch(e){console.error(e);}
    setFetchingCal(false);setStep("");
  };

  /* ─── AUTO PROCESS ─── */
  const autoProcess=async()=>{
    setStep("全自動処理を開始...");
    await fetchEmails();
    // Wait for emails, then analyze all
    // This is handled via useEffect below
  };

  const [autoMode,setAutoMode]=useState(false);
  useEffect(()=>{
    if(autoMode&&emails.length>0&&!analyzing){
      const unprocessed=emails.filter(e=>e.has_schedule_info&&!data.processedEmails?.includes(e.id));
      if(unprocessed.length>0){
        analyzeEmail(unprocessed[0]).then(()=>{
          setData(prev=>({...prev,processedEmails:[...(prev.processedEmails||[]),unprocessed[0].id]}));
        });
      }else{setAutoMode(false);}
    }
  },[autoMode,emails,analyzing]);

  const pendingCount=pendingEvents.filter(e=>e.status==="pending").length;
  const registeredCount=pendingEvents.filter(e=>e.status==="registered").length;

  const VIEWS=[
    {id:"inbox",icon:"📬",label:"メール解析",color:P.gmail},
    {id:"schedule",icon:"📅",label:"カレンダー",color:P.gcal},
    {id:"log",icon:"📜",label:"操作ログ",color:P.purple},
  ];

  return(
    <div style={{fontFamily:"'Noto Sans JP','Helvetica Neue',sans-serif",background:P.bg,color:P.text,minHeight:"100vh",display:"flex"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${P.border};border-radius:4px;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
      `}</style>

      {/* Sidebar */}
      <div style={{width:220,background:P.surface,borderRight:`1px solid ${P.border}`,padding:"16px 12px",display:"flex",flexDirection:"column",flexShrink:0}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
          <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${P.pri},${P.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",boxShadow:`0 0 20px ${P.pri}30`}}>秘</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.03em",background:`linear-gradient(90deg,${P.pri},${P.purple})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>秘書AI</div>
            <div style={{fontSize:8,color:P.muted,fontWeight:600,letterSpacing:1.5}}>SECRETARY AGENT</div>
          </div>
        </div>

        {/* Auto Process Button */}
        <button onClick={async()=>{setAutoMode(true);await fetchEmails();}} style={{
          width:"100%",padding:"12px",borderRadius:10,border:"none",marginBottom:16,cursor:"pointer",
          background:`linear-gradient(135deg,${P.gmail},${P.gcal})`,color:"#fff",fontSize:13,fontWeight:700,
          boxShadow:`0 4px 15px ${P.gmail}30`,transition:"all .2s",
        }}>
          🤖 全自動処理
        </button>

        {/* Nav */}
        {VIEWS.map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} style={{
            display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 10px",
            borderRadius:8,border:"none",cursor:"pointer",
            background:view===v.id?`${v.color}14`:"transparent",
            color:view===v.id?v.color:P.muted,fontSize:12,fontWeight:view===v.id?600:400,
            marginBottom:2,transition:"all .15s",textAlign:"left",
          }}>
            <span style={{fontSize:16}}>{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}

        <div style={{flex:1}}/>

        {/* Status */}
        <div style={{borderTop:`1px solid ${P.border}`,paddingTop:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:P.green,boxShadow:`0 0 6px ${P.green}`}}/>
            <span style={{fontSize:10,color:P.green,fontWeight:600}}>接続済</span>
          </div>
          <div style={{fontSize:9,color:P.dim,lineHeight:1.5}}>
            📧 Gmail MCP<br/>📅 Google Calendar MCP
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,padding:"20px 28px",overflow:"auto"}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>

          {/* Status Bar */}
          {step&&<div style={{
            marginBottom:14,padding:"10px 16px",borderRadius:10,
            background:`linear-gradient(90deg,${P.pri}15,${P.purple}15)`,
            border:`1px solid ${P.pri}30`,
            display:"flex",alignItems:"center",gap:10,animation:"fadeIn .3s",
          }}>
            <div style={{width:8,height:8,borderRadius:"50%",background:P.pri,animation:"pulse 1.5s infinite"}}/>
            <span style={{fontSize:12,color:P.pri,fontWeight:500}}>{step}</span>
          </div>}

          {/* Summary Stats */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
            {[
              {icon:"📧",label:"取得メール",value:`${emails.length}件`,color:P.gmail},
              {icon:"🔍",label:"抽出予定",value:`${pendingEvents.filter(e=>e.status!=="no_event").length}件`,color:P.orange},
              {icon:"✅",label:"登録済",value:`${registeredCount}件`,color:P.green},
              {icon:"⏳",label:"未登録",value:`${pendingCount}件`,color:P.cyan},
            ].map(s=>(
              <div key={s.label} style={{background:P.card,borderRadius:10,padding:"12px 16px",border:`1px solid ${P.border}`,flex:1,minWidth:120}}>
                <div style={{fontSize:9,color:P.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{s.icon} {s.label}</div>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>

          <div key={view} style={{animation:"fadeIn .3s ease"}}>

            {/* ═══ INBOX VIEW ═══ */}
            {view==="inbox"&&<div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <button onClick={fetchEmails} disabled={fetchingMail} style={{padding:"9px 20px",borderRadius:8,border:"none",background:fetchingMail?P.dim:P.gmail,color:"#fff",fontSize:13,fontWeight:600,cursor:fetchingMail?"default":"pointer"}}>
                  {fetchingMail?"📧 取得中...":"📧 メール取得"}
                </button>
                {pendingCount>0&&<button onClick={registerAll} disabled={!!schedulingId} style={{padding:"9px 20px",borderRadius:8,border:"none",background:P.gcal,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  📅 全て登録 ({pendingCount}件)
                </button>}
              </div>

              {/* Pending Events */}
              {pendingEvents.length>0&&<div style={{marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:600,color:P.orange,marginBottom:8}}>🔔 抽出された予定</div>
                {pendingEvents.filter(e=>e.status!=="no_event").map(ev=>(
                  <div key={ev.id} style={{
                    padding:"12px 16px",borderRadius:10,background:P.card,border:`1px solid ${P.border}`,marginBottom:6,
                    animation:"fadeIn .3s",borderLeft:`3px solid ${ev.status==="registered"?P.green:ev.status==="error"?P.red:P.orange}`,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:14}}>📅</span>
                      <span style={{fontSize:13,fontWeight:600,color:P.text}}>{ev.title}</span>
                      <Badge text={ev.status==="registered"?"登録済✓":ev.status==="error"?"エラー":"未登録"} color={ev.status==="registered"?P.green:ev.status==="error"?P.red:P.orange}/>
                      {ev.confidence&&<Badge text={`確度:${ev.confidence}`} color={ev.confidence==="high"?P.green:ev.confidence==="medium"?P.orange:P.dim}/>}
                    </div>
                    <div style={{fontSize:11,color:P.sub,marginBottom:4,display:"flex",gap:12,flexWrap:"wrap"}}>
                      <span>📆 {ev.date}</span>
                      <span>🕐 {ev.start_time}〜{ev.end_time}</span>
                      {ev.location&&<span>📍 {ev.location}</span>}
                    </div>
                    {ev.description&&<div style={{fontSize:11,color:P.muted,marginBottom:4}}>{ev.description}</div>}
                    <div style={{fontSize:10,color:P.dim}}>📧 元メール: {ev.emailSubject}</div>
                    {ev.status==="pending"&&<div style={{marginTop:6,display:"flex",gap:6}}>
                      <button onClick={()=>registerEvent(ev)} disabled={schedulingId===ev.id} style={{padding:"4px 12px",borderRadius:6,border:"none",background:P.gcal,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        {schedulingId===ev.id?"登録中...":"📅 登録"}
                      </button>
                      <button onClick={()=>setPendingEvents(prev=>prev.filter(e=>e.id!==ev.id))} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${P.border}`,background:"transparent",color:P.muted,fontSize:11,cursor:"pointer"}}>
                        スキップ
                      </button>
                    </div>}
                  </div>
                ))}
                {pendingEvents.filter(e=>e.status==="no_event").length>0&&<div style={{fontSize:11,color:P.dim,marginTop:4}}>
                  ℹ️ {pendingEvents.filter(e=>e.status==="no_event").length}件のメールに予定情報なし
                </div>}
              </div>}

              {/* Email List */}
              {emails.length>0&&<div>
                <div style={{fontSize:13,fontWeight:600,color:P.gmail,marginBottom:8}}>📬 受信メール</div>
                {emails.map(email=>(
                  <div key={email.id} style={{
                    padding:"12px 16px",borderRadius:10,background:P.card,border:`1px solid ${P.border}`,marginBottom:6,
                    transition:"all .15s",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{width:32,height:32,borderRadius:8,background:`${P.gmail}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>✉️</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:P.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{email.subject}</div>
                        <div style={{fontSize:11,color:P.muted}}>{email.from} ・ {email.date}</div>
                      </div>
                      {email.has_schedule_info&&<Badge text="予定あり?" color={P.orange}/>}
                      <button onClick={()=>analyzeEmail(email)} disabled={analyzing===email.id} style={{
                        padding:"5px 12px",borderRadius:6,border:"none",
                        background:analyzing===email.id?P.dim:P.pri,color:"#fff",
                        fontSize:11,fontWeight:600,cursor:analyzing===email.id?"default":"pointer",flexShrink:0,
                      }}>
                        {analyzing===email.id?"解析中...":"🔍 解析"}
                      </button>
                    </div>
                    <div style={{fontSize:11,color:P.sub,marginLeft:40,lineHeight:1.6}}>{email.snippet}</div>
                  </div>
                ))}
              </div>}

              {emails.length===0&&!fetchingMail&&<div style={{textAlign:"center",padding:"50px 20px",color:P.dim}}>
                <div style={{fontSize:48,marginBottom:12}}>📬</div>
                <div style={{fontSize:14,fontWeight:500,marginBottom:6}}>メールを取得してください</div>
                <div style={{fontSize:12}}>「メール取得」ボタンまたは「全自動処理」でGmailからメールを読み込みます</div>
              </div>}
            </div>}

            {/* ═══ CALENDAR VIEW ═══ */}
            {view==="schedule"&&<div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <button onClick={fetchCalendar} disabled={fetchingCal} style={{padding:"9px 20px",borderRadius:8,border:"none",background:fetchingCal?P.dim:P.gcal,color:"#fff",fontSize:13,fontWeight:600,cursor:fetchingCal?"default":"pointer"}}>
                  {fetchingCal?"📅 取得中...":"📅 カレンダー取得"}
                </button>
              </div>

              {/* Registered Events from this session */}
              {(data.events||[]).length>0&&<div style={{marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:600,color:P.green,marginBottom:8}}>✅ 今回登録した予定</div>
                {(data.events||[]).map((ev,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12,borderLeft:`3px solid ${P.green}`}}>
                    <span style={{fontSize:16}}>📅</span>
                    <div style={{flex:1}}>
                      <span style={{color:P.text,fontWeight:600}}>{ev.title}</span>
                      <span style={{color:P.muted,marginLeft:8,fontSize:11}}>{ev.date} {ev.start_time}〜{ev.end_time}</span>
                    </div>
                    <Badge text="登録済" color={P.green}/>
                  </div>
                ))}
              </div>}

              {/* Calendar Events */}
              {calEvents.length>0&&<div>
                <div style={{fontSize:13,fontWeight:600,color:P.gcal,marginBottom:8}}>📅 今週の予定</div>
                {calEvents.map((ev,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12}}>
                    <div style={{width:4,height:36,borderRadius:2,background:P.gcal,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{color:P.text,fontWeight:600}}>{ev.title}</div>
                      <div style={{color:P.muted,fontSize:11}}>{ev.date} {ev.start_time}〜{ev.end_time}{ev.location?` ・ 📍${ev.location}`:""}</div>
                    </div>
                  </div>
                ))}
              </div>}

              {calEvents.length===0&&(data.events||[]).length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:P.dim}}>
                <div style={{fontSize:48,marginBottom:12}}>📅</div>
                <div style={{fontSize:14,fontWeight:500}}>カレンダーを取得してください</div>
              </div>}
            </div>}

            {/* ═══ LOG VIEW ═══ */}
            {view==="log"&&<div>
              <div style={{fontSize:13,fontWeight:600,color:P.purple,marginBottom:10}}>📜 操作ログ</div>
              {(data.log||[]).length>0?(data.log||[]).map(l=>(
                <div key={l.id} style={{display:"flex",alignItems:"center",padding:"8px 14px",borderRadius:8,background:P.card,border:`1px solid ${P.border}`,marginBottom:4,gap:10,fontSize:11}}>
                  <span style={{color:P.dim,fontFamily:"'JetBrains Mono',monospace",fontSize:10,flexShrink:0}}>{l.timestamp}</span>
                  <Badge text={l.action} color={P.purple}/>
                  <span style={{color:P.text,flex:1}}>{l.detail}</span>
                </div>
              )):<div style={{textAlign:"center",padding:40,color:P.dim}}>まだ操作ログはありません</div>}

              {(data.log||[]).length>0&&<div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                <button onClick={()=>{
                  const csv="\uFEFF"+[["日時","操作","詳細"],...(data.log||[]).map(l=>[l.timestamp,l.action,l.detail])].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
                  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));a.download=`秘書ログ_${today()}.csv`;a.click();
                }} style={{padding:"5px 14px",borderRadius:6,border:"none",background:P.purple,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  📥 CSV出力
                </button>
              </div>}
            </div>}

          </div>
        </div>
      </div>
    </div>
  );
}
