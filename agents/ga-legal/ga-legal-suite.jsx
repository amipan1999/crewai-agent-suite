import { useState, useRef, useCallback, useEffect } from "react";

/* ═══ PALETTE ═══ */
const P = {
  bg:"#060a14",surface:"#0c1320",card:"#111c2e",card2:"#162035",
  border:"#1a2840",borderL:"#223050",
  text:"#e2e9f3",sub:"#9badc4",muted:"#5a6f88",dim:"#3a4b60",
  a1:"#6ee7b7",a2:"#93c5fd",a3:"#c4b5fd",a4:"#fbbf24",a5:"#f9a8d4",a6:"#67e8f9",
  red:"#f87171",redS:"#f8717118",green:"#34d399",orange:"#fb923c",
};

const TABS = [
  {id:"contract",icon:"📝",label:"契約書管理",color:P.a1,desc:"AIで契約書レビュー・作成・管理"},
  {id:"regulation",icon:"📖",label:"社内規程",color:P.a2,desc:"就業規則・規程をAIで作成・管理"},
  {id:"asset",icon:"🖥",label:"備品管理",color:P.a3,desc:"備品・資産の台帳管理"},
  {id:"attendance",icon:"⏰",label:"勤怠管理",color:P.a4,desc:"出退勤・休暇の記録・集計"},
  {id:"document",icon:"📋",label:"届出書類",color:P.a5,desc:"AIで届出書類を自動生成"},
  {id:"legal",icon:"⚖️",label:"法務相談",color:P.a6,desc:"AIに法務・コンプライアンス相談"},
];

const today=()=>new Date().toISOString().slice(0,10);
const now=()=>new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* ═══ STORAGE ═══ */
const SK="ga-legal-suite-v1";
const load=async()=>{try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):null;}catch{return null;}};
const save=async(d)=>{try{await window.storage.set(SK,JSON.stringify(d));}catch(e){console.error(e);}};

/* ═══ AI ═══ */
const callAI=async(msgs,sys)=>{
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:3000,system:sys,messages:msgs})});
  const d=await r.json();return d.content?.map(c=>c.text||"").join("")||"";
};
const pJ=t=>JSON.parse(t.replace(/```json|```/g,"").trim());

/* ═══ UI ATOMS ═══ */
const Btn=({children,onClick,c=P.a1,sm,dis,ghost,sx})=>(
  <button disabled={dis} onClick={onClick} style={{padding:sm?"5px 13px":"9px 20px",borderRadius:8,border:ghost?`1px solid ${c}44`:"none",background:ghost?"transparent":dis?P.dim:c,color:ghost?c:"#fff",fontSize:sm?11:13,fontWeight:600,cursor:dis?"default":"pointer",opacity:dis?.5:1,transition:"all .15s",whiteSpace:"nowrap",...sx}}>{children}</button>
);
const iS={width:"100%",padding:"7px 10px",borderRadius:7,border:`1px solid ${P.border}`,background:P.bg,color:P.text,fontSize:13,outline:"none",fontFamily:"inherit"};
const Inp=({label,value,onChange,type="text",ph,ta,opts,style:sx})=>(
  <div style={{marginBottom:8,...sx}}>
    {label&&<label style={{fontSize:10,color:P.muted,display:"block",marginBottom:2,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>{label}</label>}
    {opts?<select value={value} onChange={e=>onChange(e.target.value)} style={iS}>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
    :ta?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={4} style={{...iS,resize:"vertical"}}/>
    :<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={iS}/>}
  </div>
);
const Stat=({label,value,color=P.a1})=>(
  <div style={{background:P.card,borderRadius:10,padding:"13px 16px",border:`1px solid ${P.border}`,flex:1,minWidth:130}}>
    <div style={{fontSize:9,color:P.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:3}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color}}>{value}</div>
  </div>
);
const Badge=({text,color})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:600,background:`${color}20`,color,whiteSpace:"nowrap"}}>{text}</span>;
const Card=({children,sx})=><div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:16,marginBottom:14,...sx}}>{children}</div>;
const csvDL=(h,rows,fn)=>{const csv="\uFEFF"+[h,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));a.download=fn;a.click();};

const Row=({children,sx})=><div style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12,...sx}}>{children}</div>;

/* ═══════════════════════════════════════════════════
   1. 契約書管理
   ═══════════════════════════════════════════════════ */
function ContractAgent({data,setData}){
  const [mode,setMode]=useState("list"); // list | create | review | detail
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({type:"業務委託契約",party:"",summary:"",term:""});
  const [reviewText,setReviewText]=useState("");
  const [reviewResult,setReviewResult]=useState(null);
  const [detail,setDetail]=useState(null);
  const [genResult,setGenResult]=useState(null);
  const items=data.contracts||[];
  const setItems=fn=>setData(d=>({...d,contracts:typeof fn==="function"?fn(d.contracts||[]):fn}));

  const createContract=async()=>{
    setBusy(true);
    try{
      const text=await callAI([{role:"user",content:`以下の条件で${form.type}のドラフトを作成:\n相手方:${form.party}\n概要:${form.summary}\n期間:${form.term}\n本日:${today()}`}],
        `契約書ドラフト生成AI。JSONのみ返答。{"title":"契約書タイトル","type":"${form.type}","party_a":"当社","party_b":"相手方","date":"${today()}","term":"契約期間","clauses":[{"title":"条項タイトル","content":"条項内容"}],"summary":"契約概要50字"}`);
      const p=pJ(text);p.id=uid();p.status="ドラフト";p.created=today();
      setItems(prev=>[p,...prev]);
      setGenResult(p);
    }catch(e){console.error(e);}
    setBusy(false);
  };

  const reviewContract=async()=>{
    setBusy(true);setReviewResult(null);
    try{
      const text=await callAI([{role:"user",content:`以下の契約書をレビューしてください:\n${reviewText}`}],
        `契約書レビューAI。JSONのみ。{"risk_level":"高/中/低","score":85,"issues":[{"severity":"高/中/低","clause":"該当条項","issue":"問題点","suggestion":"改善提案"}],"missing_clauses":["不足条項1"],"overall_assessment":"総合評価100字","recommendations":["推奨事項1","推奨事項2"]}`);
      setReviewResult(pJ(text));
    }catch(e){console.error(e);}
    setBusy(false);
  };

  const updateStatus=(id,st)=>setItems(prev=>prev.map(c=>c.id===id?{...c,status:st}:c));

  if(mode==="create") return <div>
    <Btn sm ghost c={P.muted} onClick={()=>{setMode("list");setGenResult(null);}} sx={{marginBottom:12}}>← 一覧に戻る</Btn>
    {genResult ? <Card>
      <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>{genResult.title}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:P.muted,marginBottom:12}}>
        <div>甲: <span style={{color:P.text}}>{genResult.party_a}</span></div>
        <div>乙: <span style={{color:P.text}}>{genResult.party_b}</span></div>
        <div>契約期間: <span style={{color:P.text}}>{genResult.term}</span></div>
        <div>作成日: <span style={{color:P.text}}>{genResult.created}</span></div>
      </div>
      {(genResult.clauses||[]).map((cl,i)=><div key={i} style={{marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:600,color:P.a1,marginBottom:3}}>第{i+1}条 {cl.title}</div>
        <div style={{fontSize:12,color:P.text,lineHeight:1.8,paddingLeft:8,borderLeft:`2px solid ${P.border}`}}>{cl.content}</div>
      </div>)}
      <Btn sm c={P.a1} onClick={()=>setGenResult(null)} sx={{marginTop:8}}>✓ 完了</Btn>
    </Card> : <Card>
      <Inp label="契約種別" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} opts={["業務委託契約","秘密保持契約(NDA)","売買契約","賃貸借契約","雇用契約","ライセンス契約","代理店契約","保守契約","その他"]}/>
      <Inp label="契約相手方" value={form.party} onChange={v=>setForm(f=>({...f,party:v}))} ph="株式会社〇〇"/>
      <Inp label="契約概要" value={form.summary} onChange={v=>setForm(f=>({...f,summary:v}))} ta ph="Webシステム開発の業務委託。月額50万円。成果物の著作権は当社に帰属。"/>
      <Inp label="契約期間" value={form.term} onChange={v=>setForm(f=>({...f,term:v}))} ph="2026年4月1日〜2027年3月31日"/>
      <Btn c={P.a1} onClick={createContract} dis={busy||!form.party||!form.summary}>{busy?"🤖 生成中...":"🤖 AIで契約書ドラフト生成"}</Btn>
    </Card>}
  </div>;

  if(mode==="review") return <div>
    <Btn sm ghost c={P.muted} onClick={()=>{setMode("list");setReviewResult(null);}} sx={{marginBottom:12}}>← 一覧に戻る</Btn>
    <Card>
      <Inp label="契約書テキスト（貼り付け）" value={reviewText} onChange={setReviewText} ta ph="契約書の内容をここに貼り付けてください..."/>
      <Btn c={P.a6} onClick={reviewContract} dis={busy||!reviewText.trim()}>{busy?"🔍 レビュー中...":"🔍 AIで契約書レビュー"}</Btn>
    </Card>
    {reviewResult && <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="リスクレベル" value={reviewResult.risk_level} color={reviewResult.risk_level==="高"?P.red:reviewResult.risk_level==="中"?P.orange:P.green}/>
        <Stat label="スコア" value={`${reviewResult.score}/100`} color={reviewResult.score>=80?P.green:reviewResult.score>=60?P.orange:P.red}/>
        <Stat label="指摘事項" value={`${(reviewResult.issues||[]).length}件`} color={P.a4}/>
      </div>
      <Card><div style={{fontSize:12,fontWeight:600,color:P.a6,marginBottom:6}}>📋 総合評価</div><div style={{fontSize:13,color:P.text,lineHeight:1.8}}>{reviewResult.overall_assessment}</div></Card>
      {(reviewResult.issues||[]).length>0 && <Card>
        <div style={{fontSize:12,fontWeight:600,color:P.a4,marginBottom:8}}>⚠ 指摘事項</div>
        {reviewResult.issues.map((is,i)=><div key={i} style={{marginBottom:10,padding:10,borderRadius:8,background:P.bg,border:`1px solid ${P.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <Badge text={is.severity} color={is.severity==="高"?P.red:is.severity==="中"?P.orange:P.a2}/>
            <span style={{fontSize:12,fontWeight:600,color:P.text}}>{is.clause}</span>
          </div>
          <div style={{fontSize:12,color:P.sub,marginBottom:4}}>{is.issue}</div>
          <div style={{fontSize:11,color:P.a1}}>💡 {is.suggestion}</div>
        </div>)}
      </Card>}
      {(reviewResult.missing_clauses||[]).length>0 && <Card>
        <div style={{fontSize:12,fontWeight:600,color:P.red,marginBottom:6}}>❌ 不足条項</div>
        {reviewResult.missing_clauses.map((mc,i)=><div key={i} style={{fontSize:12,color:P.text,marginBottom:4}}>• {mc}</div>)}
      </Card>}
      {(reviewResult.recommendations||[]).length>0 && <Card>
        <div style={{fontSize:12,fontWeight:600,color:P.a1,marginBottom:6}}>💡 推奨事項</div>
        {reviewResult.recommendations.map((rc,i)=><div key={i} style={{fontSize:12,color:P.text,marginBottom:4}}>• {rc}</div>)}
      </Card>}
    </div>}
  </div>;

  if(detail) return <div>
    <Btn sm ghost c={P.muted} onClick={()=>setDetail(null)} sx={{marginBottom:12}}>← 一覧に戻る</Btn>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:16,fontWeight:700}}>{detail.title}</div>
        <Badge text={detail.status} color={detail.status==="締結済"?P.green:detail.status==="ドラフト"?P.a4:P.red}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:P.muted,marginBottom:12}}>
        <div>種別: <span style={{color:P.text}}>{detail.type}</span></div>
        <div>相手方: <span style={{color:P.text}}>{detail.party_b}</span></div>
        <div>期間: <span style={{color:P.text}}>{detail.term}</span></div>
        <div>作成日: <span style={{color:P.text}}>{detail.created}</span></div>
      </div>
      {(detail.clauses||[]).map((cl,i)=><div key={i} style={{marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:600,color:P.a1}}>第{i+1}条 {cl.title}</div>
        <div style={{fontSize:12,color:P.text,lineHeight:1.7,paddingLeft:8,borderLeft:`2px solid ${P.border}`}}>{cl.content}</div>
      </div>)}
      <div style={{display:"flex",gap:6,marginTop:10}}>
        {detail.status==="ドラフト"&&<Btn sm c={P.green} onClick={()=>{updateStatus(detail.id,"締結済");setDetail({...detail,status:"締結済"});}}>✓ 締結済にする</Btn>}
        {detail.status==="締結済"&&<Btn sm c={P.red} ghost onClick={()=>{updateStatus(detail.id,"解約");setDetail({...detail,status:"解約"});}}>解約</Btn>}
      </div>
    </Card>
  </div>;

  // list
  return <div>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      <Btn sm c={P.a1} onClick={()=>setMode("create")}>＋ 契約書作成</Btn>
      <Btn sm c={P.a6} onClick={()=>setMode("review")}>🔍 契約書レビュー</Btn>
      {items.length>0&&<Btn sm c={P.muted} ghost onClick={()=>csvDL(["タイトル","種別","相手方","期間","ステータス","作成日"],items.map(c=>[c.title,c.type,c.party_b,c.term,c.status,c.created]),`契約書一覧_${today()}.csv`)}>📥 CSV</Btn>}
    </div>
    {items.length>0 && <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <Stat label="総契約数" value={`${items.length}件`} color={P.a1}/>
      <Stat label="締結済" value={`${items.filter(c=>c.status==="締結済").length}件`} color={P.green}/>
      <Stat label="ドラフト" value={`${items.filter(c=>c.status==="ドラフト").length}件`} color={P.a4}/>
    </div>}
    {items.map(c=><Row key={c.id} sx={{cursor:"pointer"}} onClick={()=>setDetail(c)}>
      <Badge text={c.type?.slice(0,6)} color={P.a1}/>
      <Badge text={c.status} color={c.status==="締結済"?P.green:c.status==="ドラフト"?P.a4:P.red}/>
      <div style={{flex:1}}><span style={{color:P.text,fontWeight:500}}>{c.title}</span><span style={{color:P.muted,marginLeft:8,fontSize:11}}>{c.party_b} ・ {c.created}</span></div>
    </Row>)}
    {items.length===0&&<div style={{textAlign:"center",padding:40,color:P.dim}}>📝 契約書を作成またはレビューしましょう</div>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   2. 社内規程管理
   ═══════════════════════════════════════════════════ */
function RegulationAgent({data,setData}){
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({type:"就業規則",details:"",employees:""});
  const [preview,setPreview]=useState(null);
  const items=data.regulations||[];
  const setItems=fn=>setData(d=>({...d,regulations:typeof fn==="function"?fn(d.regulations||[]):fn}));

  const gen=async()=>{
    setBusy(true);
    try{
      const text=await callAI([{role:"user",content:`以下の条件で${form.type}を作成:\n詳細:${form.details}\n従業員数:${form.employees}\n本日:${today()}`}],
        `社内規程生成AI。JSONのみ。{"title":"規程タイトル","type":"${form.type}","version":"1.0","effective_date":"${today()}","chapters":[{"title":"章タイトル","articles":[{"number":1,"title":"条タイトル","content":"条文内容"}]}],"summary":"規程概要50字"}`);
      const p=pJ(text);p.id=uid();p.created=today();p.status="施行中";
      setItems(prev=>[p,...prev]);setPreview(p);setForm({type:"就業規則",details:"",employees:""});
    }catch(e){console.error(e);}
    setBusy(false);
  };

  if(preview) return <div>
    <Btn sm ghost c={P.muted} onClick={()=>setPreview(null)} sx={{marginBottom:12}}>← 一覧に戻る</Btn>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:16,fontWeight:700}}>{preview.title}</div>
        <span style={{fontSize:11,color:P.muted}}>v{preview.version} / {preview.effective_date}施行</span>
      </div>
      {(preview.chapters||[]).map((ch,ci)=><div key={ci} style={{marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:P.a2,marginBottom:6,padding:"4px 0",borderBottom:`1px solid ${P.border}`}}>第{ci+1}章 {ch.title}</div>
        {(ch.articles||[]).map((ar,ai)=><div key={ai} style={{marginBottom:8,paddingLeft:10}}>
          <div style={{fontSize:11,fontWeight:600,color:P.sub}}>第{ar.number}条 {ar.title}</div>
          <div style={{fontSize:12,color:P.text,lineHeight:1.8}}>{ar.content}</div>
        </div>)}
      </div>)}
      <Btn sm c={P.a2} onClick={()=>setPreview(null)}>✓ 閉じる</Btn>
    </Card>
  </div>;

  return <div>
    <Card>
      <Inp label="規程種別" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} opts={["就業規則","給与規程","退職金規程","育児・介護休業規程","ハラスメント防止規程","情報セキュリティ規程","テレワーク規程","出張旅費規程","慶弔見舞金規程","個人情報保護規程"]}/>
      <Inp label="会社の詳細・要望" value={form.details} onChange={v=>setForm(f=>({...f,details:v}))} ta ph="例: IT企業、フレックスタイム制、リモートワーク可、副業許可制"/>
      <Inp label="従業員数" value={form.employees} onChange={v=>setForm(f=>({...f,employees:v}))} ph="10名"/>
      <Btn c={P.a2} onClick={gen} dis={busy||!form.details}>{busy?"🤖 生成中...":"🤖 AIで規程を生成"}</Btn>
    </Card>
    {items.length>0&&<>
      <div style={{fontSize:12,fontWeight:600,color:P.muted,marginBottom:8,marginTop:4}}>規程一覧 ({items.length}件)</div>
      {items.map(r=><Row key={r.id} sx={{cursor:"pointer"}} onClick={()=>setPreview(r)}>
        <Badge text={r.type?.slice(0,6)} color={P.a2}/><Badge text={r.status} color={P.green}/>
        <div style={{flex:1}}><span style={{color:P.text,fontWeight:500}}>{r.title}</span><span style={{color:P.muted,marginLeft:8,fontSize:11}}>v{r.version} ・ {r.created}</span></div>
      </Row>)}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   3. 備品管理
   ═══════════════════════════════════════════════════ */
function AssetAgent({data,setData}){
  const [form,setForm]=useState({name:"",category:"PC・周辺機器",serial:"",location:"",assignee:"",purchaseDate:today(),price:"",status:"使用中",notes:""});
  const items=data.assets||[];
  const setItems=fn=>setData(d=>({...d,assets:typeof fn==="function"?fn(d.assets||[]):fn}));

  const add=()=>{
    if(!form.name) return;
    setItems(prev=>[{id:uid(),assetNo:`AST-${String(prev.length+1).padStart(4,"0")}`,...form,price:Number(form.price)||0},...prev]);
    setForm({name:"",category:"PC・周辺機器",serial:"",location:"",assignee:"",purchaseDate:today(),price:"",status:"使用中",notes:""});
  };

  const totalVal=items.reduce((s,a)=>s+(a.price||0),0);
  const cats=items.reduce((a,it)=>{a[it.category]=(a[it.category]||0)+1;return a;},{});

  return <div>
    <Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Inp label="備品名" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} ph="MacBook Pro 14インチ"/>
        <Inp label="カテゴリ" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} opts={["PC・周辺機器","モニター","家具","通信機器","ソフトウェア","事務用品","その他"]}/>
        <Inp label="シリアルNo" value={form.serial} onChange={v=>setForm(f=>({...f,serial:v}))} ph="SN-XXXXXX"/>
        <Inp label="設置場所" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} ph="本社3F"/>
        <Inp label="使用者" value={form.assignee} onChange={v=>setForm(f=>({...f,assignee:v}))} ph="山田太郎"/>
        <Inp label="購入日" value={form.purchaseDate} onChange={v=>setForm(f=>({...f,purchaseDate:v}))} type="date"/>
        <Inp label="取得価額" value={form.price} onChange={v=>setForm(f=>({...f,price:v}))} type="number" ph="150000"/>
        <Inp label="ステータス" value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} opts={["使用中","在庫","修理中","廃棄予定","廃棄済"]}/>
      </div>
      <Btn c={P.a3} onClick={add} dis={!form.name}>➕ 登録</Btn>
    </Card>
    {items.length>0&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="総資産数" value={`${items.length}件`} color={P.a3}/>
        <Stat label="総取得価額" value={`¥${totalVal.toLocaleString()}`} color={P.a1}/>
        <Stat label="使用中" value={`${items.filter(a=>a.status==="使用中").length}件`} color={P.green}/>
      </div>
      {Object.keys(cats).length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {Object.entries(cats).map(([c,n])=><Badge key={c} text={`${c}: ${n}`} color={P.a3}/>)}
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <Btn sm c={P.a3} onClick={()=>csvDL(["管理No","備品名","カテゴリ","シリアル","場所","使用者","購入日","価額","ステータス"],items.map(a=>[a.assetNo,a.name,a.category,a.serial,a.location,a.assignee,a.purchaseDate,a.price,a.status]),`備品台帳_${today()}.csv`)}>📥 CSV</Btn>
      </div>
      {items.map((a,i)=><Row key={a.id}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:P.muted}}>{a.assetNo}</span>
        <Badge text={a.category?.slice(0,5)} color={P.a3}/>
        <Badge text={a.status} color={a.status==="使用中"?P.green:a.status==="廃棄済"?P.red:P.a4}/>
        <div style={{flex:1}}>
          <span style={{color:P.text,fontWeight:500}}>{a.name}</span>
          <span style={{color:P.muted,marginLeft:6,fontSize:11}}>{a.assignee?`${a.assignee} ・`:""}{a.location}</span>
        </div>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:P.sub,fontSize:12}}>¥{(a.price||0).toLocaleString()}</span>
        <button onClick={()=>setItems(p=>p.filter((_,j)=>j!==i))} style={{width:24,height:24,borderRadius:5,border:"none",background:P.redS,color:P.red,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </Row>)}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   4. 勤怠管理
   ═══════════════════════════════════════════════════ */
function AttendanceAgent({data,setData}){
  const [form,setForm]=useState({date:today(),name:"",clockIn:"",clockOut:"",breakMin:"60",type:"出勤",note:""});
  const [leaveForm,setLeaveForm]=useState({name:"",type:"有給休暇",from:today(),to:today(),reason:""});
  const [tab,setTab]=useState("record");
  const records=data.attendance||[];
  const leaves=data.leaves||[];
  const setRecords=fn=>setData(d=>({...d,attendance:typeof fn==="function"?fn(d.attendance||[]):fn}));
  const setLeaves=fn=>setData(d=>({...d,leaves:typeof fn==="function"?fn(d.leaves||[]):fn}));

  const addRecord=()=>{
    if(!form.name) return;
    const ci=form.clockIn||"09:00",co=form.clockOut||"18:00";
    const [h1,m1]=ci.split(":").map(Number),[h2,m2]=co.split(":").map(Number);
    const total=((h2*60+m2)-(h1*60+m1)-Number(form.breakMin||0))/60;
    setRecords(prev=>[{id:uid(),...form,clockIn:ci,clockOut:co,workHours:Math.max(total,0).toFixed(1),overtime:Math.max(total-8,0).toFixed(1)},...prev]);
    setForm({date:today(),name:"",clockIn:"",clockOut:"",breakMin:"60",type:"出勤",note:""});
  };

  const addLeave=()=>{
    if(!leaveForm.name) return;
    setLeaves(prev=>[{id:uid(),...leaveForm,status:"申請中"},...prev]);
    setLeaveForm({name:"",type:"有給休暇",from:today(),to:today(),reason:""});
  };

  const totalHours=records.reduce((s,r)=>s+Number(r.workHours||0),0);
  const totalOT=records.reduce((s,r)=>s+Number(r.overtime||0),0);

  return <div>
    <div style={{display:"flex",gap:6,marginBottom:14}}>
      {[["record","出退勤記録"],["leave","休暇申請"]].map(([k,l])=><Btn key={k} sm c={tab===k?P.a4:P.dim} ghost={tab!==k} onClick={()=>setTab(k)}>{l}</Btn>)}
    </div>

    {tab==="record"?<>
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Inp label="日付" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} type="date"/>
          <Inp label="氏名" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} ph="山田太郎"/>
          <Inp label="出勤時刻" value={form.clockIn} onChange={v=>setForm(f=>({...f,clockIn:v}))} type="time"/>
          <Inp label="退勤時刻" value={form.clockOut} onChange={v=>setForm(f=>({...f,clockOut:v}))} type="time"/>
          <Inp label="休憩(分)" value={form.breakMin} onChange={v=>setForm(f=>({...f,breakMin:v}))} type="number"/>
          <Inp label="勤務種別" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} opts={["出勤","テレワーク","出張","半休","直行直帰"]}/>
        </div>
        <Btn c={P.a4} onClick={addRecord} dis={!form.name}>⏰ 記録</Btn>
      </Card>
      {records.length>0&&<>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <Stat label="総労働時間" value={`${totalHours.toFixed(1)}h`} color={P.a4}/>
          <Stat label="残業時間" value={`${totalOT.toFixed(1)}h`} color={totalOT>40?P.red:P.a1}/>
          <Stat label="出勤日数" value={`${records.length}日`} color={P.a2}/>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <Btn sm c={P.a4} onClick={()=>csvDL(["日付","氏名","出勤","退勤","休憩","労働時間","残業","種別"],records.map(r=>[r.date,r.name,r.clockIn,r.clockOut,r.breakMin+"分",r.workHours+"h",r.overtime+"h",r.type]),`勤怠_${today()}.csv`)}>📥 CSV</Btn>
        </div>
        {records.map((r,i)=><Row key={r.id}>
          <Badge text={r.type} color={P.a4}/>
          <div style={{flex:1}}>
            <span style={{color:P.text,fontWeight:500}}>{r.name}</span>
            <span style={{color:P.muted,marginLeft:8,fontSize:11}}>{r.date} ・ {r.clockIn}〜{r.clockOut}</span>
          </div>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:P.sub}}>{r.workHours}h</span>
          {Number(r.overtime)>0&&<Badge text={`残業${r.overtime}h`} color={P.orange}/>}
          <button onClick={()=>setRecords(p=>p.filter((_,j)=>j!==i))} style={{width:24,height:24,borderRadius:5,border:"none",background:P.redS,color:P.red,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </Row>)}
      </>}
    </>:<>
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Inp label="氏名" value={leaveForm.name} onChange={v=>setLeaveForm(f=>({...f,name:v}))} ph="山田太郎"/>
          <Inp label="休暇種別" value={leaveForm.type} onChange={v=>setLeaveForm(f=>({...f,type:v}))} opts={["有給休暇","特別休暇","慶弔休暇","育児休業","介護休業","欠勤"]}/>
          <Inp label="開始日" value={leaveForm.from} onChange={v=>setLeaveForm(f=>({...f,from:v}))} type="date"/>
          <Inp label="終了日" value={leaveForm.to} onChange={v=>setLeaveForm(f=>({...f,to:v}))} type="date"/>
        </div>
        <Inp label="理由" value={leaveForm.reason} onChange={v=>setLeaveForm(f=>({...f,reason:v}))} ph="私用のため"/>
        <Btn c={P.a5} onClick={addLeave} dis={!leaveForm.name}>📝 休暇申請</Btn>
      </Card>
      {leaves.map((l,i)=><Row key={l.id}>
        <Badge text={l.type} color={P.a5}/>
        <Badge text={l.status} color={l.status==="承認済"?P.green:l.status==="却下"?P.red:P.a4}/>
        <div style={{flex:1}}>
          <span style={{color:P.text,fontWeight:500}}>{l.name}</span>
          <span style={{color:P.muted,marginLeft:8,fontSize:11}}>{l.from}〜{l.to}</span>
        </div>
        {l.status==="申請中"&&<>
          <button onClick={()=>setLeaves(p=>p.map((x,j)=>j===i?{...x,status:"承認済"}:x))} style={{width:24,height:24,borderRadius:5,border:"none",background:`${P.green}22`,color:P.green,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</button>
          <button onClick={()=>setLeaves(p=>p.map((x,j)=>j===i?{...x,status:"却下"}:x))} style={{width:24,height:24,borderRadius:5,border:"none",background:P.redS,color:P.red,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✗</button>
        </>}
      </Row>)}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   5. 届出書類作成
   ═══════════════════════════════════════════════════ */
function DocumentAgent({data,setData}){
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({type:"入社手続き関連書類",details:"",employeeName:""});
  const [preview,setPreview]=useState(null);
  const items=data.documents||[];
  const setItems=fn=>setData(d=>({...d,documents:typeof fn==="function"?fn(d.documents||[]):fn}));

  const gen=async()=>{
    setBusy(true);
    try{
      const text=await callAI([{role:"user",content:`以下の届出書類を作成:\n種類:${form.type}\n対象者:${form.employeeName}\n詳細:${form.details}\n本日:${today()}`}],
        `届出書類生成AI。JSONのみ。{"title":"書類タイトル","type":"${form.type}","date":"${today()}","employee":"対象者名","sections":[{"heading":"セクション名","fields":[{"label":"項目名","value":"内容/記入例"}]}],"notes":"注意事項","submission_to":"提出先"}`);
      const p=pJ(text);p.id=uid();p.created=today();p.status="作成済";
      setItems(prev=>[p,...prev]);setPreview(p);setForm({type:"入社手続き関連書類",details:"",employeeName:""});
    }catch(e){console.error(e);}
    setBusy(false);
  };

  if(preview) return <div>
    <Btn sm ghost c={P.muted} onClick={()=>setPreview(null)} sx={{marginBottom:12}}>← 戻る</Btn>
    <Card>
      <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{preview.title}</div>
      <div style={{fontSize:11,color:P.muted,marginBottom:12}}>作成日: {preview.date} / 対象: {preview.employee} / 提出先: {preview.submission_to}</div>
      {(preview.sections||[]).map((sec,si)=><div key={si} style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:P.a5,marginBottom:6,padding:"4px 0",borderBottom:`1px solid ${P.border}`}}>{sec.heading}</div>
        {(sec.fields||[]).map((f,fi)=><div key={fi} style={{display:"flex",gap:10,padding:"4px 0",fontSize:12,borderBottom:`1px solid ${P.border}22`}}>
          <span style={{color:P.muted,minWidth:120,fontWeight:500}}>{f.label}</span>
          <span style={{color:P.text,flex:1}}>{f.value}</span>
        </div>)}
      </div>)}
      {preview.notes&&<div style={{fontSize:11,color:P.orange,marginTop:8}}>⚠ {preview.notes}</div>}
    </Card>
  </div>;

  return <div>
    <Card>
      <Inp label="書類種別" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} opts={["入社手続き関連書類","退職届","住所変更届","扶養控除申告書","通勤手当申請書","身元保証書","誓約書","始末書","休職届","復職届","転籍同意書","出向通知書"]}/>
      <Inp label="対象者名" value={form.employeeName} onChange={v=>setForm(f=>({...f,employeeName:v}))} ph="山田太郎"/>
      <Inp label="詳細・補足" value={form.details} onChange={v=>setForm(f=>({...f,details:v}))} ta ph="例: 2026年5月1日入社、エンジニア職、東京本社勤務"/>
      <Btn c={P.a5} onClick={gen} dis={busy||!form.employeeName}>{busy?"🤖 生成中...":"🤖 AIで書類を生成"}</Btn>
    </Card>
    {items.length>0&&<>
      <div style={{fontSize:12,fontWeight:600,color:P.muted,marginBottom:8}}>作成済書類 ({items.length}件)</div>
      {items.map(d=><Row key={d.id} sx={{cursor:"pointer"}} onClick={()=>setPreview(d)}>
        <Badge text={d.type?.slice(0,6)} color={P.a5}/>
        <div style={{flex:1}}><span style={{color:P.text,fontWeight:500}}>{d.title}</span><span style={{color:P.muted,marginLeft:8,fontSize:11}}>{d.employee} ・ {d.created}</span></div>
      </Row>)}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════════════
   6. 法務相談AI
   ═══════════════════════════════════════════════════ */
function LegalAgent(){
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState("");
  const [history,setHistory]=useState([]);

  const ask=async()=>{
    if(!query.trim()) return;
    const q=query;setQuery("");setBusy(true);
    setHistory(prev=>[...prev,{role:"user",text:q}]);
    try{
      const text=await callAI([{role:"user",content:q}],
        `あなたは企業法務・コンプライアンスのAIアドバイザーです。日本法に基づいて回答してください。\n回答時の注意:\n- 法的助言ではなく一般的な情報提供であることを明記\n- 該当する法律名・条文を可能な限り引用\n- リスクがある場合は明確に警告\n- 専門家への相談が必要な場合はその旨を伝える\n- 簡潔で分かりやすい日本語で回答`);
      setHistory(prev=>[...prev,{role:"ai",text}]);
    }catch(e){console.error(e);setHistory(prev=>[...prev,{role:"ai",text:"回答の生成に失敗しました。"}]);}
    setBusy(false);
  };

  return <div>
    <Card sx={{marginBottom:14,background:P.surface}}>
      <div style={{fontSize:11,color:P.a6,marginBottom:6,fontWeight:600}}>💡 相談例</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {["従業員を解雇する際の法的手続きは？","業務委託と雇用の違い・判断基準","個人情報保護法への対応で必要なこと","競業避止義務の有効性","残業代の計算方法と36協定"].map(ex=>(
          <button key={ex} onClick={()=>setQuery(ex)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${P.border}`,background:"transparent",color:P.sub,fontSize:11,cursor:"pointer"}}>{ex}</button>
        ))}
      </div>
    </Card>

    <div style={{minHeight:200,marginBottom:14}}>
      {history.map((h,i)=><div key={i} style={{display:"flex",justifyContent:h.role==="user"?"flex-end":"flex-start",marginBottom:8}}>
        <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:12,background:h.role==="user"?P.a6+"22":P.card,border:`1px solid ${h.role==="user"?P.a6+"44":P.border}`,fontSize:13,color:P.text,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{h.text}</div>
      </div>)}
      {busy&&<div style={{display:"flex",justifyContent:"flex-start",marginBottom:8}}><div style={{padding:"10px 14px",borderRadius:12,background:P.card,border:`1px solid ${P.border}`,fontSize:13,color:P.a6}}>⚖️ 回答を作成中...</div></div>}
    </div>

    <div style={{display:"flex",gap:8}}>
      <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!busy&&ask()} placeholder="法務・労務・コンプライアンスについて質問..." style={{...iS,flex:1}}/>
      <Btn c={P.a6} onClick={ask} dis={busy||!query.trim()}>送信</Btn>
    </div>
    <div style={{fontSize:10,color:P.dim,marginTop:8}}>⚠ AIの回答は一般的な情報提供であり、法的助言ではありません。重要な判断には弁護士にご相談ください。</div>
  </div>;
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App(){
  const [active,setActive]=useState("contract");
  const [data,setData]=useState({contracts:[],regulations:[],assets:[],attendance:[],leaves:[],documents:[]});
  const [loaded,setLoaded]=useState(false);
  const [sideOpen,setSideOpen]=useState(true);
  const tab=TABS.find(t=>t.id===active);

  useEffect(()=>{(async()=>{const s=await load();if(s)setData(s);setLoaded(true);})();},[]);
  useEffect(()=>{if(loaded)save(data);},[data,loaded]);
  const setD=useCallback(fn=>setData(prev=>typeof fn==="function"?fn(prev):fn),[]);

  const counts={contract:(data.contracts||[]).length,regulation:(data.regulations||[]).length,asset:(data.assets||[]).length,attendance:(data.attendance||[]).length,document:(data.documents||[]).length,legal:0};

  const resetAll=()=>{if(confirm("全データを削除しますか？")){setData({contracts:[],regulations:[],assets:[],attendance:[],leaves:[],documents:[]});}};

  return <div style={{fontFamily:"'Noto Sans JP','Helvetica Neue',sans-serif",background:P.bg,color:P.text,minHeight:"100vh",display:"flex"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${P.border};border-radius:4px;}
      @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
    `}</style>

    {/* Sidebar */}
    <div style={{width:sideOpen?210:56,background:P.surface,borderRight:`1px solid ${P.border}`,padding:sideOpen?"16px 10px":"16px 6px",display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,paddingLeft:2,cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>
        <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${P.a1},${P.a3})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",flexShrink:0}}>総</div>
        {sideOpen&&<div style={{overflow:"hidden",whiteSpace:"nowrap"}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.02em"}}>総務・法務AI</div>
          <div style={{fontSize:8,color:P.muted,fontWeight:600,letterSpacing:1}}>GA & LEGAL AGENTS</div>
        </div>}
      </div>
      <div style={{flex:1}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setActive(t.id)} title={t.label} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:sideOpen?"9px 10px":"9px 0",justifyContent:sideOpen?"flex-start":"center",borderRadius:8,border:"none",cursor:"pointer",background:active===t.id?`${t.color}14`:"transparent",color:active===t.id?t.color:P.muted,fontSize:12,fontWeight:active===t.id?600:400,marginBottom:2,transition:"all .15s",textAlign:"left",borderLeft:sideOpen?(active===t.id?`3px solid ${t.color}`:"3px solid transparent"):"none"}}>
          <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
          {sideOpen&&<span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden"}}>{t.label}</span>}
          {sideOpen&&counts[t.id]>0&&<span style={{fontSize:9,background:`${t.color}22`,color:t.color,padding:"1px 6px",borderRadius:8,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{counts[t.id]}</span>}
        </button>)}
      </div>
      {sideOpen&&<div style={{borderTop:`1px solid ${P.border}`,paddingTop:10}}>
        <button onClick={resetAll} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${P.border}`,background:"transparent",color:P.dim,fontSize:10,cursor:"pointer",textAlign:"left"}}>🔄 データリセット</button>
        <div style={{fontSize:9,color:P.dim,marginTop:8,lineHeight:1.5,paddingLeft:2}}>⚠ AIの回答は参考情報です。重要な判断は専門家にご相談ください。</div>
      </div>}
    </div>

    {/* Main */}
    <div style={{flex:1,padding:"20px 28px",overflow:"auto"}}>
      <div style={{maxWidth:880,margin:"0 auto"}}>
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
            <span style={{fontSize:24}}>{tab.icon}</span>
            <h2 style={{fontSize:20,fontWeight:700,margin:0}}>{tab.label}</h2>
          </div>
          <p style={{fontSize:12,color:P.muted,marginLeft:38}}>{tab.desc}</p>
        </div>
        <div key={active} style={{animation:"fadeIn .3s ease"}}>
          {active==="contract"&&<ContractAgent data={data} setData={setD}/>}
          {active==="regulation"&&<RegulationAgent data={data} setData={setD}/>}
          {active==="asset"&&<AssetAgent data={data} setData={setD}/>}
          {active==="attendance"&&<AttendanceAgent data={data} setData={setD}/>}
          {active==="document"&&<DocumentAgent data={data} setData={setD}/>}
          {active==="legal"&&<LegalAgent/>}
        </div>
      </div>
    </div>
  </div>;
}
