import { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   CrewAI ORCHESTRATION SYSTEM v2
   社長 → CrewAI → 経理 / 総務 / 法務 / 秘書
   ═══════════════════════════════════════════════════════════ */

const P = {
  bg:"#04070d",surface:"#091017",card:"#0e1723",card2:"#131e2f",
  border:"#182540",text:"#e6ecf5",sub:"#9db1c9",muted:"#5c7089",dim:"#3b4f64",
  acc:"#22d3ee",fin:"#38bdf8",ga:"#a78bfa",legal:"#34d399",sec:"#f472b6",
  red:"#f87171",orange:"#fb923c",yellow:"#fbbf24",green:"#34d399",
  gmail:"#ea4335",gcal:"#4285f4",
};

const DEPTS = [
  {id:"finance",icon:"💰",label:"経理部",color:P.fin},
  {id:"ga",icon:"🏛",label:"総務部",color:P.ga},
  {id:"legal",icon:"⚖️",label:"法務部",color:P.legal},
  {id:"secretary",icon:"💼",label:"秘書室",color:P.sec},
];

const AGENTS = {
  finance:[
    {id:"receipt",icon:"🧾",name:"領収書処理",desc:"領収書の読み取り・仕訳"},
    {id:"purchase_order",icon:"📋",name:"発注書作成",desc:"発注書の自動生成"},
    {id:"invoice",icon:"📄",name:"請求書作成",desc:"請求書の生成・入金管理"},
    {id:"cashflow",icon:"💰",name:"入出金管理",desc:"入出金の記録・収支管理"},
    {id:"expense",icon:"🗂",name:"経費精算",desc:"経費の申請・承認"},
    {id:"financial_report",icon:"📊",name:"月次レポート",desc:"月次財務サマリー生成"},
  ],
  ga:[
    {id:"asset",icon:"🖥",name:"備品管理",desc:"備品・資産の台帳管理"},
    {id:"attendance",icon:"⏰",name:"勤怠管理",desc:"出退勤・休暇管理"},
    {id:"regulation",icon:"📖",name:"社内規程",desc:"就業規則・規程の作成"},
    {id:"document",icon:"📋",name:"届出書類",desc:"届出書類の自動生成"},
    {id:"facility",icon:"🏢",name:"施設管理",desc:"会議室・オフィス管理"},
    {id:"welfare",icon:"🎁",name:"福利厚生",desc:"福利厚生の管理・申請"},
  ],
  legal:[
    {id:"contract",icon:"📝",name:"契約書管理",desc:"契約書の作成・レビュー"},
    {id:"compliance",icon:"🛡",name:"コンプライアンス",desc:"法令遵守チェック"},
    {id:"ip",icon:"💡",name:"知的財産",desc:"特許・商標の管理"},
    {id:"dispute",icon:"⚠️",name:"紛争対応",desc:"トラブル・クレーム対応"},
    {id:"legal_consult",icon:"⚖️",name:"法務相談",desc:"法務全般の相談"},
    {id:"privacy",icon:"🔒",name:"個人情報保護",desc:"プライバシー対応"},
  ],
  secretary:[
    {id:"mail_scan",icon:"📧",name:"メール解析",desc:"Gmailからメール取得・解析"},
    {id:"schedule_extract",icon:"🔍",name:"予定抽出",desc:"メールから予定を自動抽出"},
    {id:"calendar_register",icon:"📅",name:"カレンダー登録",desc:"Googleカレンダーに予定登録"},
    {id:"calendar_view",icon:"🗓",name:"スケジュール確認",desc:"今週の予定を取得・表示"},
    {id:"meeting_prep",icon:"📑",name:"会議準備",desc:"会議資料・アジェンダ作成"},
    {id:"daily_brief",icon:"☀️",name:"デイリーブリーフ",desc:"毎朝の業務ブリーフィング"},
  ],
};

const ALL_AGENTS=[...AGENTS.finance,...AGENTS.ga,...AGENTS.legal,...AGENTS.secretary];

const SK="crewai-v2-full";
const loadS=async()=>{try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):null;}catch{return null;}};
const saveS=async d=>{try{await window.storage.set(SK,JSON.stringify(d));}catch(e){console.error(e);}};

const MCP_GMAIL={type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"};
const MCP_GCAL={type:"url",url:"https://gcal.mcp.claude.com/mcp",name:"gcal"};

const callAI=async(msgs,sys,mcpServers)=>{
  const body={model:"claude-sonnet-4-20250514",max_tokens:3500,system:sys,messages:msgs};
  if(mcpServers)body.mcp_servers=mcpServers;
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return await r.json();
};

const extractText=c=>{if(!c||!Array.isArray(c))return"";return c.filter(b=>b.type==="text").map(b=>b.text).join("\n");};
const extractToolResults=c=>{if(!c||!Array.isArray(c))return[];return c.filter(b=>b.type==="mcp_tool_result").map(b=>{try{return b.content?.[0]?.text||"";}catch{return"";}});};
const pJ=t=>{try{return JSON.parse(t.replace(/```json|```/g,"").trim());}catch{return null;}};
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);

/* ═══ UI ATOMS ═══ */
const iS={width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${P.border}`,background:P.bg,color:P.text,fontSize:13,outline:"none",fontFamily:"inherit"};
const Badge=({text,color})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600,background:`${color}20`,color,whiteSpace:"nowrap"}}>{text}</span>;
const Stat=({label,value,color=P.acc,icon})=>(
  <div style={{background:P.card,borderRadius:10,padding:"13px 16px",border:`1px solid ${P.border}`,flex:1,minWidth:125}}>
    <div style={{fontSize:9,color:P.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{icon} {label}</div>
    <div style={{fontSize:18,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color}}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   CREW COMMANDER - NL Router + Executor
   ═══════════════════════════════════════════════════════════ */
function CrewCommander({data,setData}){
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [results,setResults]=useState([]);
  const ref=useRef();

  const ROUTER_SYS=`あなたはCrewAIオーケストレーターです。社長からの指示を受け、適切なAIエージェントに仕事を振り分けます。

利用可能なエージェント:
【経理部】領収書処理, 発注書作成, 請求書作成, 入出金管理, 経費精算, 月次レポート
【総務部】備品管理, 勤怠管理, 社内規程, 届出書類, 施設管理, 福利厚生
【法務部】契約書管理, コンプライアンス, 知的財産, 紛争対応, 法務相談, 個人情報保護
【秘書室】メール解析(Gmail), 予定抽出, カレンダー登録(Google Calendar), スケジュール確認, 会議準備, デイリーブリーフ

秘書室のエージェントはGmail MCPとGoogle Calendar MCPに接続しており、実際のメール取得・カレンダー操作が可能です。

JSONのみ返してください:
{"understanding":"指示の理解(30字)","plan":[{"agent_id":"ID","agent_name":"名前","department":"finance/ga/legal/secretary","task":"タスク詳細","priority":"high/medium/low","estimated_time":"所要時間","uses_mcp":"gmail/gcal/none"}],"dependencies":"依存関係","total_steps":数値,"ceo_summary":"社長へのサマリー(100字)"}

エージェントID: receipt,purchase_order,invoice,cashflow,expense,financial_report,asset,attendance,regulation,document,facility,welfare,contract,compliance,ip,dispute,legal_consult,privacy,mail_scan,schedule_extract,calendar_register,calendar_view,meeting_prep,daily_brief`;

  const execute=async()=>{
    if(!input.trim())return;
    const query=input;setInput("");setBusy(true);

    const nr={id:uid(),query,timestamp:new Date().toLocaleString("ja-JP"),status:"routing",plan:null,executions:[],summary:null};
    setResults(prev=>[nr,...prev]);

    try{
      // Route
      const routeResp=await callAI([{role:"user",content:query}],ROUTER_SYS);
      const plan=pJ(extractText(routeResp.content));
      nr.plan=plan;nr.status="executing";
      setResults(prev=>prev.map(r=>r.id===nr.id?{...nr}:r));

      // Execute each
      for(let i=0;i<(plan?.plan||[]).length;i++){
        const task=plan.plan[i];
        const agInfo=ALL_AGENTS.find(a=>a.id===task.agent_id)||{icon:"🤖",name:task.agent_name};
        const usesMcp=task.uses_mcp||"none";

        try{
          let execResp;
          if(usesMcp==="gmail"){
            execResp=await callAI(
              [{role:"user",content:`タスク: ${task.task}\n社長の指示: ${query}`}],
              `あなたは秘書AIの「${task.agent_name}」です。Gmailを使ってタスクを実行してください。結果を詳しく報告してください。`,
              [MCP_GMAIL]
            );
          }else if(usesMcp==="gcal"){
            execResp=await callAI(
              [{role:"user",content:`タスク: ${task.task}\n社長の指示: ${query}`}],
              `あなたは秘書AIの「${task.agent_name}」です。Googleカレンダーを使ってタスクを実行してください。結果を詳しく報告してください。`,
              [MCP_GCAL]
            );
          }else{
            execResp=await callAI(
              [{role:"user",content:`あなたは「${task.agent_name}」エージェント(${task.department}部門)です。\nタスク: ${task.task}\n社長の指示: ${query}\n\n結果をJSONのみで返してください: {"status":"completed/needs_input","result":"結果詳細(200字)","next_steps":["次のステップ"],"warnings":["注意事項"]}`}],
              `指定タスクを実行するAIエージェントです。JSONのみ返答。`
            );
          }

          const text=extractText(execResp.content);
          const toolRes=extractToolResults(execResp.content);
          const parsed=pJ(text);

          nr.executions.push({
            agent:task,agentInfo:agInfo,
            result:parsed||{status:"completed",result:text.slice(0,300),next_steps:[],warnings:[]},
            rawText:text,toolResults:toolRes,
            completed:true,usedMcp:usesMcp,
          });
        }catch(e){
          nr.executions.push({agent:task,agentInfo:agInfo,result:{status:"error",result:"実行失敗",next_steps:[],warnings:[]},completed:false,usedMcp:usesMcp});
        }
        setResults(prev=>prev.map(r=>r.id===nr.id?{...nr}:r));
      }

      // CEO Summary
      const sumResp=await callAI(
        [{role:"user",content:`社長報告を作成:\n指示: ${query}\n実行結果:\n${nr.executions.map((ex,i)=>`${i+1}. [${ex.agent.department}] ${ex.agent.agent_name}: ${ex.result?.result||ex.rawText?.slice(0,200)||"完了"}`).join("\n")}`}],
        `社長報告書生成AI。JSONのみ。{"title":"報告タイトル","executive_summary":"エグゼクティブサマリー(150字)","results":[{"department":"部門","agent":"エージェント名","status":"完了/進行中/要確認","summary":"要約"}],"action_items":["アクション"],"risks":["リスク"],"recommendation":"提言(100字)"}`
      );
      nr.summary=pJ(extractText(sumResp.content));
      nr.status="completed";

      setData(prev=>({...prev,taskLog:[{id:nr.id,query,timestamp:nr.timestamp,planSteps:plan?.total_steps||0,summary:nr.summary?.title||""},...(prev.taskLog||[]).slice(0,49)]}));
    }catch(e){console.error(e);nr.status="error";}
    setResults(prev=>prev.map(r=>r.id===nr.id?{...nr}:r));
    setBusy(false);
  };

  return <div>
    {/* Command */}
    <div style={{background:P.card,borderRadius:14,border:`1px solid ${P.border}`,padding:20,marginBottom:18}}>
      <div style={{fontSize:11,color:P.acc,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🎯 社長コマンド</div>
      <div style={{display:"flex",gap:10}}>
        <input ref={ref} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!busy&&execute()}
          placeholder="指示を入力... 例:「今日のメールを確認して予定をカレンダーに入れて」"
          style={{...iS,flex:1,fontSize:14,padding:"10px 14px"}}/>
        <button onClick={execute} disabled={busy||!input.trim()} style={{
          padding:"10px 28px",borderRadius:10,border:"none",
          background:busy?P.dim:`linear-gradient(135deg,${P.acc},${P.sec})`,
          color:"#fff",fontSize:14,fontWeight:700,cursor:busy?"default":"pointer",
          opacity:busy?.5:1,whiteSpace:"nowrap",
        }}>{busy?"⏳ 実行中...":"🚀 実行"}</button>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:10}}>
        {[
          "今日のメールを確認して重要な予定をカレンダーに登録して",
          "今月の経営状況を全部門から報告して",
          "新入社員の受け入れ準備を全部門で進めて",
          "取引先とのNDA契約書を作成して",
          "明日の会議のアジェンダを準備して",
          "今週のスケジュールを教えて",
        ].map(cmd=>(
          <button key={cmd} onClick={()=>{setInput(cmd);ref.current?.focus();}}
            style={{padding:"3px 9px",borderRadius:5,border:`1px solid ${P.border}`,background:"transparent",color:P.sub,fontSize:10,cursor:"pointer",transition:"all .15s"}}
            onMouseEnter={e=>{e.target.style.borderColor=P.acc;e.target.style.color=P.acc;}}
            onMouseLeave={e=>{e.target.style.borderColor=P.border;e.target.style.color=P.sub;}}>{cmd}</button>
        ))}
      </div>
    </div>

    {/* Results */}
    {results.map(r=>(
      <div key={r.id} style={{background:P.card,borderRadius:14,border:`1px solid ${P.border}`,marginBottom:14,overflow:"hidden",animation:"fadeIn .4s"}}>
        {/* Header */}
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${P.border}`,display:"flex",alignItems:"center",gap:8}}>
          <Badge text={r.status==="completed"?"✓ 完了":r.status==="error"?"✗ エラー":r.status==="executing"?"⏳ 実行中":"🔄 解析中"} color={r.status==="completed"?P.green:r.status==="error"?P.red:P.yellow}/>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:P.text}}>{r.query}</div><div style={{fontSize:10,color:P.dim,marginTop:1}}>{r.timestamp}</div></div>
        </div>

        {/* Plan */}
        {r.plan&&<div style={{padding:"10px 16px",borderBottom:`1px solid ${P.border}`}}>
          <div style={{fontSize:11,color:P.acc,fontWeight:600,marginBottom:6}}>📋 実行プラン ({r.plan.total_steps}ステップ)</div>
          <div style={{fontSize:11,color:P.sub,marginBottom:8}}>{r.plan.understanding}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(r.plan.plan||[]).map((step,i)=>{
              const ag=ALL_AGENTS.find(a=>a.id===step.agent_id);
              const ex=r.executions[i];
              const dc=step.department==="finance"?P.fin:step.department==="ga"?P.ga:step.department==="legal"?P.legal:P.sec;
              return <div key={i} style={{padding:"8px 10px",borderRadius:8,background:ex?.completed?`${P.green}08`:P.surface,border:`1px solid ${ex?.completed?`${P.green}25`:P.border}`,minWidth:140,flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                  <span style={{fontSize:13}}>{ag?.icon||"🤖"}</span>
                  <span style={{fontSize:10,fontWeight:600,color:dc}}>{step.agent_name}</span>
                  {step.uses_mcp!=="none"&&<Badge text={step.uses_mcp==="gmail"?"Gmail":"GCal"} color={step.uses_mcp==="gmail"?P.gmail:P.gcal}/>}
                  {ex?.completed&&<span style={{fontSize:9,color:P.green}}>✓</span>}
                </div>
                <div style={{fontSize:9,color:P.muted,lineHeight:1.4}}>{step.task.slice(0,50)}{step.task.length>50?"...":""}</div>
                <div style={{display:"flex",gap:3,marginTop:3}}>
                  <Badge text={step.priority} color={step.priority==="high"?P.red:step.priority==="medium"?P.orange:P.green}/>
                  <span style={{fontSize:8,color:P.dim}}>{step.estimated_time}</span>
                </div>
              </div>;
            })}
          </div>
        </div>}

        {/* Executions */}
        {r.executions.length>0&&<div style={{padding:"10px 16px",borderBottom:r.summary?`1px solid ${P.border}`:"none"}}>
          <div style={{fontSize:11,color:P.yellow,fontWeight:600,marginBottom:6}}>⚡ 実行結果</div>
          {r.executions.map((ex,i)=>(
            <div key={i} style={{padding:"8px 10px",borderRadius:8,background:P.surface,border:`1px solid ${P.border}`,marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{fontSize:13}}>{ex.agentInfo.icon}</span>
                <span style={{fontSize:11,fontWeight:600,color:P.text}}>{ex.agent.agent_name}</span>
                {ex.usedMcp!=="none"&&<Badge text={ex.usedMcp==="gmail"?"📧 Gmail API":"📅 Calendar API"} color={ex.usedMcp==="gmail"?P.gmail:P.gcal}/>}
                <Badge text={ex.result?.status==="completed"?"完了":ex.result?.status==="error"?"エラー":"報告"} color={ex.result?.status==="completed"?P.green:ex.result?.status==="error"?P.red:P.acc}/>
              </div>
              <div style={{fontSize:11,color:P.sub,lineHeight:1.7}}>{ex.result?.result||ex.rawText?.slice(0,250)||"完了"}</div>
              {ex.toolResults?.length>0&&<div style={{fontSize:10,color:P.muted,marginTop:3,padding:"4px 8px",borderRadius:4,background:`${P.bg}`,maxHeight:80,overflow:"auto"}}>
                {ex.toolResults.map((tr,j)=><div key={j}>{tr.slice(0,150)}{tr.length>150?"...":""}</div>)}
              </div>}
              {ex.result?.warnings?.length>0&&<div style={{fontSize:10,color:P.orange,marginTop:2}}>⚠ {ex.result.warnings.join(" / ")}</div>}
            </div>
          ))}
        </div>}

        {/* CEO Summary */}
        {r.summary&&<div style={{padding:"12px 16px",background:`${P.acc}05`}}>
          <div style={{fontSize:12,fontWeight:700,color:P.acc,marginBottom:6}}>📊 社長報告: {r.summary.title}</div>
          <div style={{fontSize:12,color:P.text,lineHeight:1.8,marginBottom:8}}>{r.summary.executive_summary}</div>
          {r.summary.results?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {r.summary.results.map((res,i)=>(
              <div key={i} style={{padding:"5px 8px",borderRadius:6,background:P.card,border:`1px solid ${P.border}`,fontSize:10,flex:1,minWidth:130}}>
                <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:1}}>
                  <Badge text={res.department} color={res.department==="経理"?P.fin:res.department==="総務"?P.ga:res.department==="法務"?P.legal:P.sec}/>
                  <span style={{fontWeight:600,color:P.text}}>{res.agent}</span>
                </div>
                <div style={{color:P.sub}}>{res.summary}</div>
              </div>
            ))}
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {r.summary.action_items?.length>0&&<div style={{padding:8,borderRadius:6,background:P.card,border:`1px solid ${P.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:P.green,marginBottom:3}}>✅ アクション</div>
              {r.summary.action_items.map((a,i)=><div key={i} style={{fontSize:10,color:P.text,marginBottom:1}}>• {a}</div>)}
            </div>}
            {r.summary.risks?.length>0&&<div style={{padding:8,borderRadius:6,background:P.card,border:`1px solid ${P.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:P.orange,marginBottom:3}}>⚠ リスク</div>
              {r.summary.risks.map((rk,i)=><div key={i} style={{fontSize:10,color:P.text,marginBottom:1}}>• {rk}</div>)}
            </div>}
          </div>
          {r.summary.recommendation&&<div style={{marginTop:6,padding:"6px 10px",borderRadius:6,background:`${P.acc}10`,border:`1px solid ${P.acc}25`,fontSize:11,color:P.acc}}>💡 {r.summary.recommendation}</div>}
        </div>}
      </div>
    ))}

    {results.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:P.dim}}>
      <div style={{fontSize:48,marginBottom:14}}>🚀</div>
      <div style={{fontSize:15,fontWeight:500,marginBottom:6}}>社長コマンドを入力してください</div>
      <div style={{fontSize:12,lineHeight:1.7}}>自然言語で指示するだけで、4部門22エージェントが連携して実行します<br/>秘書エージェントはGmail・Googleカレンダーと直接連携します</div>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════
   SECRETARY PANEL - Gmail → Calendar Direct
   ═══════════════════════════════════════════════════════════ */
function SecretaryPanel({data,setData}){
  const [emails,setEmails]=useState([]);
  const [pending,setPending]=useState([]);
  const [calEvents,setCalEvents]=useState([]);
  const [busy,setBusy]=useState("");
  const [step,setStep]=useState("");

  const fetchMail=async()=>{
    setBusy("mail");setStep("Gmailからメール取得中...");
    try{
      const resp=await callAI([{role:"user",content:"受信トレイの最新メールを10件取得して、件名・送信者・日時・本文概要を教えてください。"}],
        "Gmailアシスタントです。受信トレイからメールを取得してください。",[MCP_GMAIL]);
      const text=extractText(resp.content);
      const tools=extractToolResults(resp.content);
      const parseR=await callAI([{role:"user",content:`以下からメール一覧をJSON抽出:\n${text}\n${tools.join("\n")}`}],
        `JSON only: {"emails":[{"id":"ID","subject":"件名","from":"送信者","date":"日時","snippet":"概要100字","has_schedule":true/false}]}`);
      const p=pJ(extractText(parseR.content));
      if(p?.emails)setEmails(p.emails);
    }catch(e){console.error(e);}
    setBusy("");setStep("");
  };

  const analyzeEmail=async(email)=>{
    setBusy("analyze-"+email.id);setStep(`「${email.subject}」を解析中...`);
    try{
      const fullR=await callAI([{role:"user",content:`メールの全文を取得: 件名「${email.subject}」送信者「${email.from}」`}],
        "Gmailアシスタント。指定メールの全文取得。",[MCP_GMAIL]);
      const full=extractText(fullR.content)+"\n"+extractToolResults(fullR.content).join("\n");
      const anaR=await callAI([{role:"user",content:`以下のメールから予定情報を全て抽出:\n件名:${email.subject}\n送信者:${email.from}\n${full}`}],
        `スケジュール抽出AI。JSON only: {"events":[{"title":"タイトル","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":"場所","description":"詳細","attendees":"参加者","confidence":"high/medium/low"}],"no_schedule_reason":"予定なしの理由"}`);
      const p=pJ(extractText(anaR.content));
      if(p?.events?.length>0){
        setPending(prev=>[...p.events.map(ev=>({...ev,id:uid(),emailSubject:email.subject,status:"pending"})),...prev]);
      }
    }catch(e){console.error(e);}
    setBusy("");setStep("");
  };

  const registerEvent=async(ev)=>{
    setBusy("reg-"+ev.id);setStep(`「${ev.title}」をカレンダーに登録中...`);
    try{
      await callAI([{role:"user",content:`Googleカレンダーに登録:\nタイトル:${ev.title}\n日付:${ev.date}\n開始:${ev.start_time}\n終了:${ev.end_time}\n場所:${ev.location||"なし"}\n詳細:${ev.description||""}`}],
        "Googleカレンダーアシスタント。予定を登録してください。",[MCP_GCAL]);
      setPending(prev=>prev.map(e=>e.id===ev.id?{...e,status:"registered"}:e));
      setData(prev=>({...prev,calendarLog:[{id:uid(),title:ev.title,date:ev.date,time:`${ev.start_time}-${ev.end_time}`,registeredAt:new Date().toLocaleString("ja-JP")},...(prev.calendarLog||[]).slice(0,49)]}));
    }catch(e){console.error(e);setPending(prev=>prev.map(e=>e.id===ev.id?{...e,status:"error"}:e));}
    setBusy("");setStep("");
  };

  const registerAll=async()=>{for(const ev of pending.filter(e=>e.status==="pending"))await registerEvent(ev);};

  const fetchCal=async()=>{
    setBusy("cal");setStep("カレンダー取得中...");
    try{
      const resp=await callAI([{role:"user",content:`今日(${today()})から1週間の予定を取得してください。`}],
        "Googleカレンダーアシスタント。予定取得。",[MCP_GCAL]);
      const text=extractText(resp.content)+"\n"+extractToolResults(resp.content).join("\n");
      const pR=await callAI([{role:"user",content:`以下からカレンダー予定をJSON抽出:\n${text}`}],
        `JSON only: {"events":[{"title":"予定名","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":"場所"}]}`);
      const p=pJ(extractText(pR.content));
      if(p?.events)setCalEvents(p.events);
    }catch(e){console.error(e);}
    setBusy("");setStep("");
  };

  const pc=pending.filter(e=>e.status==="pending").length;

  return <div>
    {step&&<div style={{marginBottom:10,padding:"8px 14px",borderRadius:8,background:`${P.sec}10`,border:`1px solid ${P.sec}25`,display:"flex",alignItems:"center",gap:8,animation:"fadeIn .3s"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:P.sec,animation:"pulse 1.5s infinite"}}/>
      <span style={{fontSize:11,color:P.sec}}>{step}</span>
    </div>}

    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
      <button onClick={fetchMail} disabled={busy==="mail"} style={{padding:"8px 16px",borderRadius:8,border:"none",background:P.gmail,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{busy==="mail"?"取得中...":"📧 メール取得"}</button>
      <button onClick={fetchCal} disabled={busy==="cal"} style={{padding:"8px 16px",borderRadius:8,border:"none",background:P.gcal,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{busy==="cal"?"取得中...":"📅 カレンダー取得"}</button>
      {pc>0&&<button onClick={registerAll} disabled={!!busy} style={{padding:"8px 16px",borderRadius:8,border:"none",background:P.green,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>✅ 全件登録 ({pc})</button>}
    </div>

    {/* Pending */}
    {pending.filter(e=>e.status!=="no_event").length>0&&<div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,color:P.orange,marginBottom:6}}>🔔 抽出された予定</div>
      {pending.filter(e=>e.status!=="no_event").map(ev=>(
        <div key={ev.id} style={{padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,borderLeft:`3px solid ${ev.status==="registered"?P.green:ev.status==="error"?P.red:P.orange}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
            <span style={{fontSize:13,fontWeight:600,color:P.text}}>{ev.title}</span>
            <Badge text={ev.status==="registered"?"登録済✓":ev.status==="error"?"エラー":"未登録"} color={ev.status==="registered"?P.green:ev.status==="error"?P.red:P.orange}/>
            {ev.confidence&&<Badge text={ev.confidence} color={ev.confidence==="high"?P.green:P.orange}/>}
          </div>
          <div style={{fontSize:11,color:P.sub,display:"flex",gap:10}}>
            <span>📆 {ev.date}</span><span>🕐 {ev.start_time}〜{ev.end_time}</span>{ev.location&&<span>📍 {ev.location}</span>}
          </div>
          <div style={{fontSize:10,color:P.dim,marginTop:2}}>📧 {ev.emailSubject}</div>
          {ev.status==="pending"&&<div style={{marginTop:4,display:"flex",gap:4}}>
            <button onClick={()=>registerEvent(ev)} disabled={busy==="reg-"+ev.id} style={{padding:"3px 10px",borderRadius:5,border:"none",background:P.gcal,color:"#fff",fontSize:10,fontWeight:600,cursor:"pointer"}}>{busy==="reg-"+ev.id?"登録中...":"📅 登録"}</button>
            <button onClick={()=>setPending(p=>p.filter(e=>e.id!==ev.id))} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${P.border}`,background:"transparent",color:P.muted,fontSize:10,cursor:"pointer"}}>スキップ</button>
          </div>}
        </div>
      ))}
    </div>}

    {/* Emails */}
    {emails.length>0&&<div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,color:P.gmail,marginBottom:6}}>📬 受信メール</div>
      {emails.map(em=>(
        <div key={em.id} style={{padding:"8px 12px",borderRadius:8,background:P.card,border:`1px solid ${P.border}`,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:P.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{em.subject}</div>
            <div style={{fontSize:10,color:P.muted}}>{em.from} ・ {em.date}</div>
          </div>
          {em.has_schedule&&<Badge text="予定?" color={P.orange}/>}
          <button onClick={()=>analyzeEmail(em)} disabled={busy==="analyze-"+em.id} style={{padding:"4px 10px",borderRadius:5,border:"none",background:busy==="analyze-"+em.id?P.dim:P.sec,color:"#fff",fontSize:10,fontWeight:600,cursor:"pointer",flexShrink:0}}>
            {busy==="analyze-"+em.id?"解析中":"🔍 解析"}
          </button>
        </div>
      ))}
    </div>}

    {/* Calendar */}
    {calEvents.length>0&&<div>
      <div style={{fontSize:12,fontWeight:600,color:P.gcal,marginBottom:6}}>📅 今週の予定</div>
      {calEvents.map((ev,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",padding:"8px 12px",borderRadius:8,background:P.card,border:`1px solid ${P.border}`,marginBottom:4,gap:8,fontSize:11}}>
          <div style={{width:3,height:30,borderRadius:2,background:P.gcal,flexShrink:0}}/>
          <div style={{flex:1}}><div style={{color:P.text,fontWeight:600}}>{ev.title}</div><div style={{color:P.muted}}>{ev.date} {ev.start_time}〜{ev.end_time}{ev.location?` ・ ${ev.location}`:""}</div></div>
        </div>
      ))}
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════
   AGENT MONITOR
   ═══════════════════════════════════════════════════════════ */
function AgentMonitor({data}){
  return <div>
    {Object.entries(AGENTS).map(([dept,agents])=>{
      const di=DEPTS.find(d=>d.id===dept);
      return <div key={dept} style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:16}}>{di.icon}</span>
          <span style={{fontSize:13,fontWeight:700,color:di.color}}>{di.label}</span>
          {dept==="secretary"&&<Badge text="Gmail & Calendar MCP" color={P.sec}/>}
          <div style={{flex:1,height:1,background:P.border}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:6}}>
          {agents.map(ag=>(
            <div key={ag.id} style={{padding:"12px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                <span style={{fontSize:18}}>{ag.icon}</span>
                <div style={{width:5,height:5,borderRadius:"50%",background:P.green,boxShadow:`0 0 4px ${P.green}`}}/>
              </div>
              <div style={{fontSize:11,fontWeight:600,color:P.text,marginBottom:1}}>{ag.name}</div>
              <div style={{fontSize:9,color:P.muted,lineHeight:1.4}}>{ag.desc}</div>
            </div>
          ))}
        </div>
      </div>;
    })}
    {(data.taskLog||[]).length>0&&<div style={{marginTop:16}}>
      <div style={{fontSize:12,fontWeight:600,color:P.muted,marginBottom:6}}>📜 タスク履歴</div>
      {(data.taskLog||[]).slice(0,15).map(t=>(
        <div key={t.id} style={{display:"flex",alignItems:"center",padding:"6px 10px",borderRadius:6,background:P.card,border:`1px solid ${P.border}`,marginBottom:3,gap:8,fontSize:10}}>
          <span style={{color:P.dim,fontFamily:"'JetBrains Mono',monospace",fontSize:9,flexShrink:0}}>{t.timestamp}</span>
          <div style={{flex:1,color:P.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.query}</div>
          <span style={{color:P.dim}}>{t.planSteps}steps</span>
          <Badge text="完了" color={P.green}/>
        </div>
      ))}
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════
   CROSS-DEPT DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function Dashboard({data}){
  const [report,setReport]=useState(null);
  const [busy,setBusy]=useState(false);

  const gen=async()=>{
    setBusy(true);
    try{
      const r=await callAI([{role:"user",content:`全社データ: タスク${(data.taskLog||[]).length}件, カレンダー登録${(data.calendarLog||[]).length}件\n全社経営レポート生成`}],
        `経営ダッシュボードAI。JSONのみ。{"date":"${today()}","health":"良好/注意/要改善","departments":[{"name":"部門名","status":"良好/注意/要改善","highlights":["ポイント"],"metrics":{"key":"value"}}],"cross_issues":["横断課題"],"recommendations":["提言"],"priorities":["優先事項"]}`);
      setReport(pJ(extractText(r.content)));
    }catch(e){console.error(e);}
    setBusy(false);
  };

  return <div>
    <button onClick={gen} disabled={busy} style={{padding:"10px 22px",borderRadius:10,border:"none",background:busy?P.dim:`linear-gradient(135deg,${P.fin},${P.ga},${P.legal},${P.sec})`,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:14}}>
      {busy?"分析中...":"📊 全社レポート生成"}
    </button>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <Stat icon="📋" label="総タスク" value={`${(data.taskLog||[]).length}`} color={P.acc}/>
      <Stat icon="🤖" label="エージェント" value={`${ALL_AGENTS.length}`} color={P.green}/>
      <Stat icon="🏢" label="部門" value="4" color={P.ga}/>
      <Stat icon="📅" label="登録予定" value={`${(data.calendarLog||[]).length}`} color={P.gcal}/>
    </div>
    {report&&<div style={{animation:"fadeIn .4s"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700}}>全社レポート</div>
        <Badge text={report.health} color={report.health==="良好"?P.green:P.orange}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8,marginBottom:14}}>
        {(report.departments||[]).map((d,i)=>{
          const cs=[P.fin,P.ga,P.legal,P.sec];
          return <div key={i} style={{background:P.card,borderRadius:10,border:`1px solid ${P.border}`,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,fontWeight:700,color:cs[i%4]}}>{d.name}</span>
              <Badge text={d.status} color={d.status==="良好"?P.green:P.orange}/>
            </div>
            {(d.highlights||[]).map((h,j)=><div key={j} style={{fontSize:10,color:P.sub,marginBottom:2}}>• {h}</div>)}
          </div>;
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[{t:"🔗 横断課題",items:report.cross_issues,c:P.orange},{t:"💡 提言",items:report.recommendations,c:P.acc},{t:"🎯 優先事項",items:report.priorities,c:P.green}].map(s=>(
          <div key={s.t} style={{background:P.card,borderRadius:8,border:`1px solid ${P.border}`,padding:12}}>
            <div style={{fontSize:10,fontWeight:600,color:s.c,marginBottom:4}}>{s.t}</div>
            {(s.items||[]).map((it,i)=><div key={i} style={{fontSize:10,color:P.text,lineHeight:1.6,marginBottom:2}}>• {it}</div>)}
          </div>
        ))}
      </div>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
export default function App(){
  const [view,setView]=useState("command");
  const [data,setData]=useState({taskLog:[],calendarLog:[]});
  const [loaded,setLoaded]=useState(false);
  const [sideOpen,setSideOpen]=useState(true);

  useEffect(()=>{(async()=>{const s=await loadS();if(s)setData(s);setLoaded(true);})();},[]);
  useEffect(()=>{if(loaded)saveS(data);},[data,loaded]);
  const setD=useCallback(fn=>setData(prev=>typeof fn==="function"?fn(prev):fn),[]);

  const VIEWS=[
    {id:"command",icon:"🎯",label:"コマンド",desc:"AIに指示",color:P.acc},
    {id:"secretary",icon:"💼",label:"秘書室",desc:"メール・カレンダー",color:P.sec},
    {id:"monitor",icon:"📡",label:"モニター",desc:"エージェント状況",color:P.green},
    {id:"dashboard",icon:"📊",label:"ダッシュボード",desc:"全社レポート",color:P.yellow},
  ];

  return <div style={{fontFamily:"'Noto Sans JP','Helvetica Neue',sans-serif",background:P.bg,color:P.text,minHeight:"100vh",display:"flex"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${P.border};border-radius:4px;}
      @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
      @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
    `}</style>

    {/* Sidebar */}
    <div style={{width:sideOpen?230:58,background:P.surface,borderRight:`1px solid ${P.border}`,padding:sideOpen?"14px 10px":"14px 6px",display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,paddingLeft:2,cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>
        <div style={{width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${P.acc},${P.sec})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:`0 0 18px ${P.acc}30`}}>AI</div>
        {sideOpen&&<div><div style={{fontSize:14,fontWeight:800,background:`linear-gradient(90deg,${P.acc},${P.sec})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>CrewAI v2</div><div style={{fontSize:7,color:P.muted,fontWeight:600,letterSpacing:1.5}}>FULL ORCHESTRATION</div></div>}
      </div>

      {sideOpen&&<div style={{padding:"7px 8px",borderRadius:7,background:`${P.acc}08`,border:`1px solid ${P.acc}18`,marginBottom:14,display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:26,height:26,borderRadius:6,background:P.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>👔</div>
        <div><div style={{fontSize:10,fontWeight:600,color:P.text}}>社長 (CEO)</div><div style={{fontSize:8,color:P.muted}}>全権限</div></div>
      </div>}

      {sideOpen&&<div style={{fontSize:8,color:P.dim,fontWeight:600,letterSpacing:1.5,padding:"0 6px",marginBottom:4}}>CONTROL</div>}
      {VIEWS.map(v=>(
        <button key={v.id} onClick={()=>setView(v.id)} title={v.label} style={{
          display:"flex",alignItems:"center",gap:9,width:"100%",padding:sideOpen?"8px 8px":"8px 0",justifyContent:sideOpen?"flex-start":"center",
          borderRadius:7,border:"none",cursor:"pointer",background:view===v.id?`${v.color}12`:"transparent",
          color:view===v.id?v.color:P.muted,fontSize:11,fontWeight:view===v.id?600:400,marginBottom:2,transition:"all .15s",textAlign:"left",
        }}>
          <span style={{fontSize:15,flexShrink:0}}>{v.icon}</span>
          {sideOpen&&<div><div>{v.label}</div><div style={{fontSize:8,color:P.dim}}>{v.desc}</div></div>}
        </button>
      ))}

      {sideOpen&&<><div style={{fontSize:8,color:P.dim,fontWeight:600,letterSpacing:1.5,padding:"8px 6px 4px",marginTop:8}}>DEPARTMENTS</div>
      {DEPTS.map(d=>(
        <div key={d.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:5,marginBottom:1}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:P.green,boxShadow:`0 0 4px ${P.green}`,animation:"pulse 3s infinite"}}/>
          <span style={{fontSize:10,color:P.sub}}>{d.icon} {d.label}</span>
          <span style={{fontSize:8,color:P.dim,marginLeft:"auto"}}>{AGENTS[d.id].length}</span>
        </div>
      ))}</>}

      <div style={{flex:1}}/>
      {sideOpen&&<div style={{borderTop:`1px solid ${P.border}`,paddingTop:8}}>
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"2px 6px"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:P.green,boxShadow:`0 0 5px ${P.green}`}}/>
          <span style={{fontSize:9,color:P.green,fontWeight:600}}>全システム稼働中</span>
        </div>
        <div style={{fontSize:8,color:P.dim,padding:"2px 6px"}}>{ALL_AGENTS.length}エージェント / 4部門 / Gmail+Calendar連携</div>
      </div>}
    </div>

    {/* Main */}
    <div style={{flex:1,padding:"18px 26px",overflow:"auto"}}>
      <div style={{maxWidth:920,margin:"0 auto"}}>
        {/* View Header */}
        <div style={{marginBottom:14}}>
          {VIEWS.filter(v=>v.id===view).map(v=>(
            <div key={v.id} style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:22}}>{v.icon}</span>
              <div><div style={{fontSize:18,fontWeight:700}}>{v.label}</div><div style={{fontSize:11,color:P.muted}}>{v.desc}</div></div>
            </div>
          ))}
        </div>
        <div key={view} style={{animation:"fadeIn .3s"}}>
          {view==="command"&&<CrewCommander data={data} setData={setD}/>}
          {view==="secretary"&&<SecretaryPanel data={data} setData={setD}/>}
          {view==="monitor"&&<AgentMonitor data={data}/>}
          {view==="dashboard"&&<Dashboard data={data}/>}
        </div>
      </div>
    </div>
  </div>;
}
