import { useState, useRef, useCallback, useEffect } from "react";

/* ═══ PALETTE ═══ */
const P = {
  bg: "#060b18", surface: "#0d1525", card: "#131d30", card2: "#192438",
  border: "#1c2a42", borderLight: "#243352",
  text: "#e4eaf2", sub: "#a0b1c8", muted: "#5e7490", dim: "#3a4d66",
  a1: "#38bdf8", a2: "#818cf8", a3: "#34d399", a4: "#fb923c", a5: "#f472b6", a6: "#facc15",
  red: "#ef4444", redSoft: "#ef444422",
};

const CATS = ["旅費交通費","交際費","消耗品費","通信費","会議費","新聞図書費","地代家賃","水道光熱費","広告宣伝費","雑費","福利厚生費","外注費","租税公課","修繕費"];
const CC = {"旅費交通費":"#3b82f6","交際費":"#ef4444","消耗品費":"#22c55e","通信費":"#a855f7","会議費":"#f97316","新聞図書費":"#06b6d4","地代家賃":"#6366f1","水道光熱費":"#eab308","広告宣伝費":"#e11d48","雑費":"#6b7280","福利厚生費":"#10b981","外注費":"#8b5cf6","租税公課":"#dc2626","修繕費":"#14b8a6"};
const TABS = [
  { id:"receipt", icon:"🧾", label:"領収書", color:P.a1, desc:"領収書画像→自動仕訳" },
  { id:"purchase", icon:"📋", label:"発注書", color:P.a2, desc:"AIで発注書を自動生成" },
  { id:"invoice", icon:"📄", label:"請求書", color:P.a3, desc:"AIで請求書を自動生成" },
  { id:"cashflow", icon:"💰", label:"入出金", color:P.a4, desc:"入出金を記録・収支管理" },
  { id:"expense", icon:"🗂", label:"経費精算", color:P.a5, desc:"経費の申請・承認管理" },
  { id:"report", icon:"📊", label:"月次レポート", color:P.a6, desc:"AIが月次分析を自動生成" },
];
const today = () => new Date().toISOString().slice(0,10);

/* ═══ STORAGE ═══ */
const STORE_KEY = "accounting-agent-data";
const loadStore = async () => {
  try { const r = await window.storage.get(STORE_KEY); return r ? JSON.parse(r.value) : null; } catch { return null; }
};
const saveStore = async (data) => {
  try { await window.storage.set(STORE_KEY, JSON.stringify(data)); } catch(e) { console.error("save err", e); }
};

/* ═══ AI CALL ═══ */
const callAI = async (messages, system) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system, messages }),
  });
  const d = await res.json();
  return d.content?.map(c => c.text || "").join("") || "";
};
const pJ = (t) => JSON.parse(t.replace(/```json|```/g, "").trim());

/* ═══ UI ATOMS ═══ */
const Btn = ({ children, onClick, c = P.a1, sm, dis, ghost, sx }) => (
  <button disabled={dis} onClick={onClick} style={{
    padding: sm ? "5px 14px" : "9px 22px", borderRadius: 8,
    border: ghost ? `1px solid ${c}44` : "none",
    background: ghost ? "transparent" : dis ? P.dim : c,
    color: ghost ? c : "#fff", fontSize: sm ? 11 : 13, fontWeight: 600,
    cursor: dis ? "default" : "pointer", opacity: dis ? .5 : 1,
    transition: "all .15s", whiteSpace: "nowrap", ...sx,
  }}>{children}</button>
);

const Inp = ({ label, value, onChange, type="text", ph, ta, opts, style:sx }) => (
  <div style={{ marginBottom: 8, ...sx }}>
    {label && <label style={{ fontSize: 10, color: P.muted, display:"block", marginBottom: 2, fontWeight: 600, textTransform:"uppercase", letterSpacing:.5 }}>{label}</label>}
    {opts ? <select value={value} onChange={e=>onChange(e.target.value)} style={iS}>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
    : ta ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={3} style={{...iS,resize:"vertical"}} />
    : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={iS} />}
  </div>
);
const iS = { width:"100%", padding:"7px 10px", borderRadius:7, border:`1px solid ${P.border}`, background:P.bg, color:P.text, fontSize:13, outline:"none", fontFamily:"inherit" };

const Stat = ({ label, value, color=P.a1 }) => (
  <div style={{ background:P.card, borderRadius:10, padding:"14px 18px", border:`1px solid ${P.border}`, flex:1, minWidth:130 }}>
    <div style={{ fontSize:9, color:P.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2, marginBottom:3 }}>{label}</div>
    <div style={{ fontSize:20, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color }}>{value}</div>
  </div>
);

const Badge = ({ text, color }) => (
  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, fontWeight:600, background:`${color}20`, color, whiteSpace:"nowrap" }}>{text}</span>
);

const yen = (n) => `¥${Number(n||0).toLocaleString()}`;

const csvDL = (h, rows, fn) => {
  const csv = "\uFEFF" + [h,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download = fn; a.click();
};

/* ═══════════════════════════════════════════
   AGENT 1: 領収書処理
   ═══════════════════════════════════════════ */
function ReceiptAgent({ data, setData }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef();
  const entries = data.receipts || [];
  const setEntries = (fn) => setData(d => ({ ...d, receipts: typeof fn === "function" ? fn(d.receipts||[]) : fn }));

  const process = async (file) => {
    setBusy(true); setErr(null);
    try {
      const b64 = await new Promise((res,rej) => { const r = new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
      const text = await callAI(
        [{ role:"user", content:[{ type:"image", source:{type:"base64",media_type:file.type||"image/jpeg",data:b64} },{ type:"text", text:"この領収書を読み取って仕訳してください。" }] }],
        `経理AIです。領収書画像からJSONのみ返してください。\n{"date":"YYYY-MM-DD","vendor":"店名","amount":数値,"tax":数値,"category":"勘定科目","description":"摘要","payment_method":"現金/カード/電子マネー/その他"}\n勘定科目:${CATS.join(",")}\n日付不明→${today()}, 金額不明→0`
      );
      const p = pJ(text);
      setEntries(prev => [{ id:Date.now(), ...p }, ...prev]);
    } catch(e) { console.error(e); setErr("読み取りに失敗しました。再度お試しください。"); }
    setBusy(false);
  };

  const total = entries.reduce((s,e) => s+(Number(e.amount)||0), 0);

  return <div>
    <div onClick={()=>!busy&&ref.current?.click()}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);e.dataTransfer.files[0]&&process(e.dataTransfer.files[0]);}}
      style={{ border:`2px dashed ${dragOver?P.a1:P.border}`, borderRadius:14, padding:busy?20:44, textAlign:"center", cursor:busy?"wait":"pointer", background:dragOver?`${P.a1}08`:P.surface, transition:"all .25s", marginBottom:14 }}>
      {busy ? <div style={{color:P.a1,fontWeight:600}}>🔍 AIが領収書を解析中...</div> : <>
        <div style={{fontSize:36,marginBottom:8}}>📸</div>
        <div style={{color:P.sub,fontSize:13,fontWeight:500}}>領収書の画像をドロップ / クリックで選択</div>
        <div style={{color:P.dim,fontSize:11,marginTop:4}}>カメラ撮影にも対応</div>
      </>}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={e=>e.target.files[0]&&process(e.target.files[0])} style={{display:"none"}} />
    </div>
    {err && <div style={{color:P.red,fontSize:12,marginBottom:8}}>⚠ {err}</div>}
    {entries.length > 0 && <>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="合計金額" value={yen(total)} /><Stat label="件数" value={`${entries.length}件`} color={P.a3} />
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <Btn sm c={P.a1} onClick={()=>csvDL(["日付","取引先","金額","税","科目","摘要","支払"],entries.map(e=>[e.date,e.vendor,e.amount,e.tax,e.category,e.description,e.payment_method]),`領収書_${today()}.csv`)}>📥 CSV出力</Btn>
      </div>
      {entries.map((e,i)=>(
        <div key={e.id} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:12,fontSize:12}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontWeight:600,color:P.text}}>{e.vendor}</span>
              <Badge text={e.category} color={CC[e.category]||P.muted} />
            </div>
            <div style={{color:P.muted,fontSize:11}}>{e.date} ・ {e.description} ・ {e.payment_method}</div>
          </div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:P.text,fontSize:14}}>{yen(e.amount)}</div>
          <button onClick={()=>setEntries(p=>p.filter((_,j)=>j!==i))} style={{width:26,height:26,borderRadius:5,border:"none",background:P.redSoft,color:P.red,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      ))}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════
   AGENT 2: 発注書作成
   ═══════════════════════════════════════════ */
function PurchaseAgent({ data, setData }) {
  const [form, setForm] = useState({vendor:"",items:"",notes:""});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const orders = data.purchases || [];
  const setOrders = (fn) => setData(d=>({...d,purchases:typeof fn==="function"?fn(d.purchases||[]):fn}));

  const gen = async () => {
    setBusy(true);
    try {
      const text = await callAI([{role:"user",content:`発注書作成:\n発注先:${form.vendor}\n品目:${form.items}\n備考:${form.notes}\n本日:${today()}`}],
        `発注書生成AI。JSONのみ。{"order_no":"PO-0001","date":"${today()}","vendor":"発注先","items":[{"name":"品名","quantity":1,"unit":"個","unit_price":1000,"amount":1000}],"subtotal":小計,"tax":税,"total":合計,"delivery_date":"納期","notes":"備考"}`);
      const p = pJ(text);
      p.order_no = `PO-${String((orders.length)+1).padStart(4,"0")}`;
      p.id = Date.now();
      setOrders(prev=>[p,...prev]);
      setPreview(p);
      setForm({vendor:"",items:"",notes:""});
    } catch(e){console.error(e);}
    setBusy(false);
  };

  if (preview) return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:20,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:18,fontWeight:700}}>発 注 書</div>
        <span style={{fontSize:12,color:P.muted,fontFamily:"'JetBrains Mono',monospace"}}>{preview.order_no}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:P.muted,marginBottom:14}}>
        <div>発注先: <span style={{color:P.text,fontWeight:500}}>{preview.vendor}</span></div>
        <div>発注日: <span style={{color:P.text}}>{preview.date}</span></div>
        <div>納期: <span style={{color:P.text}}>{preview.delivery_date||"未定"}</span></div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:12}}>
        <thead><tr>{["品名","数量","単価","小計"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",color:P.muted,borderBottom:`1px solid ${P.border}`,fontSize:10,fontWeight:600}}>{h}</th>)}</tr></thead>
        <tbody>{(preview.items||[]).map((it,i)=><tr key={i}><td style={{padding:"6px 8px",color:P.text}}>{it.name}</td><td style={{padding:"6px 8px",color:P.sub}}>{it.quantity} {it.unit}</td><td style={{padding:"6px 8px",color:P.sub}}>{yen(it.unit_price)}</td><td style={{padding:"6px 8px",color:P.text,fontWeight:600}}>{yen(it.amount)}</td></tr>)}</tbody>
      </table>
      <div style={{textAlign:"right",fontSize:13}}>
        <div style={{color:P.muted}}>小計: {yen(preview.subtotal)}</div>
        <div style={{color:P.muted}}>消費税: {yen(preview.tax)}</div>
        <div style={{fontSize:20,fontWeight:700,color:P.a2,fontFamily:"'JetBrains Mono',monospace",marginTop:4}}>合計: {yen(preview.total)}</div>
      </div>
      {preview.notes && <div style={{marginTop:8,fontSize:11,color:P.muted}}>備考: {preview.notes}</div>}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <Btn sm c={P.a2} onClick={()=>csvDL(["No","日付","発注先","品名","数量","単価","小計"],(preview.items||[]).map(it=>[preview.order_no,preview.date,preview.vendor,it.name,it.quantity,it.unit_price,it.amount]),`発注書_${preview.order_no}.csv`)}>📥 CSV</Btn>
        <Btn sm ghost c={P.muted} onClick={()=>setPreview(null)}>← 戻る</Btn>
      </div>
    </div>
  </div>;

  return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:18,marginBottom:14}}>
      <Inp label="発注先" value={form.vendor} onChange={v=>setForm(f=>({...f,vendor:v}))} ph="株式会社〇〇" />
      <Inp label="品目・数量（自由入力でOK）" value={form.items} onChange={v=>setForm(f=>({...f,items:v}))} ta ph="例: ノートPC 3台、マウス 5個、27インチモニター 2台" />
      <Inp label="備考" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} ph="納期希望・配送先など" />
      <Btn c={P.a2} onClick={gen} dis={busy||!form.vendor||!form.items}>{busy?"🤖 生成中...":"🤖 AIで発注書を生成"}</Btn>
    </div>
    {orders.length > 0 && <>
      <div style={{fontSize:12,fontWeight:600,color:P.muted,marginBottom:8}}>発注履歴 ({orders.length}件)</div>
      {orders.map((o,i)=>(
        <div key={o.id} onClick={()=>setPreview(o)} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:12,fontSize:12,cursor:"pointer",transition:"background .15s"}}>
          <Badge text={o.order_no} color={P.a2} />
          <div style={{flex:1}}><span style={{color:P.text,fontWeight:500}}>{o.vendor}</span><span style={{color:P.muted,marginLeft:8}}>{o.date}</span></div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:P.text}}>{yen(o.total)}</div>
        </div>
      ))}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════
   AGENT 3: 請求書作成
   ═══════════════════════════════════════════ */
function InvoiceAgent({ data, setData }) {
  const [form, setForm] = useState({client:"",items:"",due:"",notes:""});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const invoices = data.invoices || [];
  const setInvoices = (fn) => setData(d=>({...d,invoices:typeof fn==="function"?fn(d.invoices||[]):fn}));

  const gen = async () => {
    setBusy(true);
    try {
      const text = await callAI([{role:"user",content:`請求書作成:\n請求先:${form.client}\n品目:${form.items}\n支払期限:${form.due||"未定"}\n備考:${form.notes}\n本日:${today()}`}],
        `請求書生成AI。JSONのみ。{"invoice_no":"INV-0001","date":"${today()}","client":"請求先","items":[{"name":"品名","quantity":1,"unit":"式","unit_price":100000,"amount":100000}],"subtotal":数値,"tax":数値,"total":数値,"due_date":"支払期限","bank":"〇〇銀行 〇〇支店 普通 1234567","notes":"備考"}`);
      const p = pJ(text);
      p.invoice_no = `INV-${String((invoices.length)+1).padStart(4,"0")}`;
      p.id = Date.now(); p.status = "未入金";
      setInvoices(prev=>[p,...prev]);
      setPreview(p);
      setForm({client:"",items:"",due:"",notes:""});
    } catch(e){console.error(e);}
    setBusy(false);
  };

  const markPaid = (id) => setInvoices(prev=>prev.map(inv=>inv.id===id?{...inv,status:"入金済"}:inv));

  if (preview) return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:20,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:18,fontWeight:700}}>請 求 書</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Badge text={preview.status} color={preview.status==="入金済"?P.a3:P.a4} />
          <span style={{fontSize:12,color:P.muted,fontFamily:"'JetBrains Mono',monospace"}}>{preview.invoice_no}</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:P.muted,marginBottom:14}}>
        <div>請求先: <span style={{color:P.text,fontWeight:500}}>{preview.client}</span></div>
        <div>発行日: <span style={{color:P.text}}>{preview.date}</span></div>
        <div>支払期限: <span style={{color:P.text}}>{preview.due_date}</span></div>
        <div>振込先: <span style={{color:P.text}}>{preview.bank}</span></div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:12}}>
        <thead><tr>{["品名","数量","単価","小計"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",color:P.muted,borderBottom:`1px solid ${P.border}`,fontSize:10,fontWeight:600}}>{h}</th>)}</tr></thead>
        <tbody>{(preview.items||[]).map((it,i)=><tr key={i}><td style={{padding:"6px 8px",color:P.text}}>{it.name}</td><td style={{padding:"6px 8px",color:P.sub}}>{it.quantity} {it.unit||""}</td><td style={{padding:"6px 8px",color:P.sub}}>{yen(it.unit_price)}</td><td style={{padding:"6px 8px",color:P.text,fontWeight:600}}>{yen(it.amount)}</td></tr>)}</tbody>
      </table>
      <div style={{textAlign:"right",fontSize:13}}>
        <div style={{color:P.muted}}>小計: {yen(preview.subtotal)}</div>
        <div style={{color:P.muted}}>消費税: {yen(preview.tax)}</div>
        <div style={{fontSize:20,fontWeight:700,color:P.a3,fontFamily:"'JetBrains Mono',monospace",marginTop:4}}>合計: {yen(preview.total)}</div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <Btn sm c={P.a3} onClick={()=>csvDL(["No","日付","請求先","品名","数量","単価","小計","期限"],(preview.items||[]).map(it=>[preview.invoice_no,preview.date,preview.client,it.name,it.quantity,it.unit_price,it.amount,preview.due_date]),`請求書_${preview.invoice_no}.csv`)}>📥 CSV</Btn>
        {preview.status!=="入金済" && <Btn sm c={P.a3} ghost onClick={()=>{markPaid(preview.id);setPreview({...preview,status:"入金済"});}}>✓ 入金済にする</Btn>}
        <Btn sm ghost c={P.muted} onClick={()=>setPreview(null)}>← 戻る</Btn>
      </div>
    </div>
  </div>;

  return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:18,marginBottom:14}}>
      <Inp label="請求先" value={form.client} onChange={v=>setForm(f=>({...f,client:v}))} ph="株式会社〇〇" />
      <Inp label="品目・金額（自由入力でOK）" value={form.items} onChange={v=>setForm(f=>({...f,items:v}))} ta ph="例: Webサイト制作 1式 500,000円、ロゴデザイン 1式 100,000円" />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Inp label="支払期限" value={form.due} onChange={v=>setForm(f=>({...f,due:v}))} type="date" />
        <Inp label="備考" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} ph="振込手数料等" />
      </div>
      <Btn c={P.a3} onClick={gen} dis={busy||!form.client||!form.items}>{busy?"🤖 生成中...":"🤖 AIで請求書を生成"}</Btn>
    </div>
    {invoices.length > 0 && <>
      <div style={{fontSize:12,fontWeight:600,color:P.muted,marginBottom:8}}>請求履歴 ({invoices.length}件)</div>
      {invoices.map(o=>(
        <div key={o.id} onClick={()=>setPreview(o)} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12,cursor:"pointer"}}>
          <Badge text={o.invoice_no} color={P.a3} />
          <Badge text={o.status} color={o.status==="入金済"?P.a3:P.a4} />
          <div style={{flex:1}}><span style={{color:P.text,fontWeight:500}}>{o.client}</span><span style={{color:P.muted,marginLeft:8}}>{o.date}</span></div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:P.text}}>{yen(o.total)}</div>
        </div>
      ))}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════
   AGENT 4: 入出金管理
   ═══════════════════════════════════════════ */
function CashflowAgent({ data, setData }) {
  const [form, setForm] = useState({date:today(),type:"入金",category:"売上",counterparty:"",amount:"",note:""});
  const txns = data.cashflow || [];
  const setTxns = (fn) => setData(d=>({...d,cashflow:typeof fn==="function"?fn(d.cashflow||[]):fn}));

  const add = () => {
    if (!form.amount||!form.counterparty) return;
    setTxns(prev=>[{id:Date.now(),...form,amount:Number(form.amount)},...prev]);
    setForm({date:today(),type:"入金",category:"売上",counterparty:"",amount:"",note:""});
  };

  const inc = txns.filter(t=>t.type==="入金").reduce((s,t)=>s+t.amount,0);
  const exp = txns.filter(t=>t.type==="出金").reduce((s,t)=>s+t.amount,0);

  return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:18,marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Inp label="日付" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} type="date" />
        <Inp label="種別" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} opts={["入金","出金"]} />
        <Inp label="相手先" value={form.counterparty} onChange={v=>setForm(f=>({...f,counterparty:v}))} ph="取引先名" />
        <Inp label="金額" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} type="number" ph="10000" />
        <Inp label="分類" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} opts={["売上","仕入","給与","家賃","光熱費","通信費","広告費","その他"]} />
        <Inp label="メモ" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} ph="補足" />
      </div>
      <Btn c={P.a4} onClick={add} dis={!form.amount||!form.counterparty}>➕ 記録する</Btn>
    </div>
    {txns.length > 0 && <>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="入金合計" value={yen(inc)} color={P.a3} />
        <Stat label="出金合計" value={yen(exp)} color={P.red} />
        <Stat label="収支" value={yen(inc-exp)} color={inc-exp>=0?P.a3:P.red} />
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <Btn sm c={P.a4} onClick={()=>csvDL(["日付","種別","相手先","金額","分類","メモ"],txns.map(t=>[t.date,t.type,t.counterparty,t.amount,t.category,t.note]),`入出金_${today()}.csv`)}>📥 CSV出力</Btn>
      </div>
      {txns.map((t,i)=>(
        <div key={t.id} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12}}>
          <Badge text={t.type} color={t.type==="入金"?P.a3:P.red} />
          <div style={{flex:1}}>
            <span style={{color:P.text,fontWeight:500}}>{t.counterparty}</span>
            <span style={{color:P.muted,marginLeft:8,fontSize:11}}>{t.date} ・ {t.category}{t.note?` ・ ${t.note}`:""}</span>
          </div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:t.type==="入金"?P.a3:P.red}}>{t.type==="入金"?"+":"-"}{yen(t.amount)}</div>
          <button onClick={()=>setTxns(p=>p.filter((_,j)=>j!==i))} style={{width:24,height:24,borderRadius:5,border:"none",background:P.redSoft,color:P.red,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      ))}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════
   AGENT 5: 経費精算
   ═══════════════════════════════════════════ */
function ExpenseAgent({ data, setData }) {
  const [form, setForm] = useState({date:today(),applicant:"",category:CATS[0],amount:"",description:""});
  const claims = data.expenses || [];
  const setClaims = (fn) => setData(d=>({...d,expenses:typeof fn==="function"?fn(d.expenses||[]):fn}));

  const submit = () => {
    if (!form.amount||!form.applicant) return;
    setClaims(prev=>[{id:Date.now(),...form,amount:Number(form.amount),status:"申請中"},...prev]);
    setForm({date:today(),applicant:"",category:CATS[0],amount:"",description:""});
  };

  const setStatus = (i, st) => setClaims(prev=>prev.map((c,j)=>j===i?{...c,status:st}:c));
  const approved = claims.filter(c=>c.status==="承認済").reduce((s,c)=>s+c.amount,0);
  const pending = claims.filter(c=>c.status==="申請中").length;

  return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:18,marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Inp label="申請日" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} type="date" />
        <Inp label="申請者" value={form.applicant} onChange={v=>setForm(f=>({...f,applicant:v}))} ph="山田太郎" />
        <Inp label="勘定科目" value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} opts={CATS} />
        <Inp label="金額" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} type="number" ph="5000" />
      </div>
      <Inp label="内容" value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} ph="クライアント打合せ タクシー代" />
      <Btn c={P.a5} onClick={submit} dis={!form.amount||!form.applicant}>📝 経費申請</Btn>
    </div>
    {claims.length > 0 && <>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="承認済合計" value={yen(approved)} color={P.a3} />
        <Stat label="未承認" value={`${pending}件`} color={P.a5} />
        <Stat label="申請総額" value={yen(claims.reduce((s,c)=>s+c.amount,0))} color={P.a1} />
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <Btn sm c={P.a5} onClick={()=>csvDL(["日付","申請者","科目","金額","内容","ステータス"],claims.map(c=>[c.date,c.applicant,c.category,c.amount,c.description,c.status]),`経費精算_${today()}.csv`)}>📥 CSV出力</Btn>
      </div>
      {claims.map((c,i)=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:9,background:P.card,border:`1px solid ${P.border}`,marginBottom:5,gap:10,fontSize:12}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontWeight:600,color:P.text}}>{c.applicant}</span>
              <Badge text={c.category} color={CC[c.category]||P.muted} />
              <Badge text={c.status} color={c.status==="承認済"?P.a3:c.status==="差戻し"?P.red:P.a6} />
            </div>
            <div style={{color:P.muted,fontSize:11}}>{c.date} ・ {c.description}</div>
          </div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:P.text}}>{yen(c.amount)}</div>
          {c.status==="申請中" && <>
            <button onClick={()=>setStatus(i,"承認済")} style={{width:26,height:26,borderRadius:5,border:"none",background:`${P.a3}22`,color:P.a3,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</button>
            <button onClick={()=>setStatus(i,"差戻し")} style={{width:26,height:26,borderRadius:5,border:"none",background:P.redSoft,color:P.red,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✗</button>
          </>}
        </div>
      ))}
    </>}
  </div>;
}

/* ═══════════════════════════════════════════
   AGENT 6: 月次レポート
   ═══════════════════════════════════════════ */
function ReportAgent({ data }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(today().slice(0,7));

  const gen = async () => {
    setBusy(true);
    try {
      const snap = {
        receipts_count: (data.receipts||[]).length,
        receipts_total: (data.receipts||[]).reduce((s,e)=>s+(Number(e.amount)||0),0),
        purchases_count: (data.purchases||[]).length,
        purchases_total: (data.purchases||[]).reduce((s,e)=>s+(Number(e.total)||0),0),
        invoices_count: (data.invoices||[]).length,
        invoices_total: (data.invoices||[]).reduce((s,e)=>s+(Number(e.total)||0),0),
        invoices_unpaid: (data.invoices||[]).filter(i=>i.status!=="入金済").length,
        cashflow_income: (data.cashflow||[]).filter(t=>t.type==="入金").reduce((s,t)=>s+(t.amount||0),0),
        cashflow_expense: (data.cashflow||[]).filter(t=>t.type==="出金").reduce((s,t)=>s+(t.amount||0),0),
        expenses_approved: (data.expenses||[]).filter(c=>c.status==="承認済").reduce((s,c)=>s+(c.amount||0),0),
        expenses_pending: (data.expenses||[]).filter(c=>c.status==="申請中").length,
        receipt_categories: (data.receipts||[]).reduce((a,e)=>{a[e.category]=(a[e.category]||0)+(Number(e.amount)||0);return a;},{}),
      };
      const text = await callAI([{role:"user",content:`${month}の経理データ:\n${JSON.stringify(snap)}\nこのデータに基づいて月次レポートを生成してください。データが0の場合はその旨を報告してください。`}],
        `月次レポート生成AI。JSONのみ。{"month":"${month}","summary":"全体概要(150字)","total_income":数値,"total_expense":数値,"profit":数値,"kpi":[{"label":"指標名","value":"値","trend":"up/down/flat"}],"category_breakdown":[{"category":"科目","amount":数値}],"highlights":["ポイント1","ポイント2"],"risks":["リスク1"],"actions":["アクション1","アクション2"]}`);
      setReport(pJ(text));
    } catch(e){console.error(e);}
    setBusy(false);
  };

  return <div>
    <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:18,marginBottom:14}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
        <Inp label="対象月" value={month} onChange={setMonth} type="month" style={{flex:1,marginBottom:0}} />
        <Btn c={P.a6} onClick={gen} dis={busy} sx={{marginBottom:0,height:35}}>{busy?"分析中...":"📊 レポート生成"}</Btn>
      </div>
    </div>
    {report && <div style={{animation:"fadeIn .4s ease"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        <Stat label="収入" value={yen(report.total_income)} color={P.a3} />
        <Stat label="支出" value={yen(report.total_expense)} color={P.red} />
        <Stat label="利益" value={yen(report.profit)} color={Number(report.profit)>=0?P.a1:P.red} />
      </div>

      {report.kpi?.length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
        {report.kpi.map((k,i)=>(
          <div key={i} style={{background:P.card,borderRadius:10,padding:"10px 16px",border:`1px solid ${P.border}`,minWidth:120}}>
            <div style={{fontSize:9,color:P.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>{k.label}</div>
            <div style={{fontSize:16,fontWeight:700,color:P.text,fontFamily:"'JetBrains Mono',monospace"}}>{k.value} <span style={{fontSize:12}}>{k.trend==="up"?"📈":k.trend==="down"?"📉":"➡️"}</span></div>
          </div>
        ))}
      </div>}

      <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:16,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:P.a6,marginBottom:6}}>📝 サマリー</div>
        <div style={{fontSize:13,color:P.text,lineHeight:1.8}}>{report.summary}</div>
      </div>

      {report.category_breakdown?.length > 0 && <div style={{background:P.card,borderRadius:12,border:`1px solid ${P.border}`,padding:16,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:P.a6,marginBottom:10}}>📂 科目別内訳</div>
        {report.category_breakdown.map((c,i)=>{
          const mx = Math.max(...report.category_breakdown.map(x=>x.amount),1);
          return <div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:P.text}}>{c.category}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",color:P.sub}}>{yen(c.amount)}</span>
            </div>
            <div style={{height:5,borderRadius:3,background:P.border}}>
              <div style={{height:"100%",borderRadius:3,width:`${Math.max((c.amount/mx)*100,2)}%`,background:CC[c.category]||P.a2,transition:"width .6s"}} />
            </div>
          </div>;
        })}
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[{t:"🌟 ハイライト",items:report.highlights,c:P.a3},{t:"⚠ リスク",items:report.risks,c:P.a4},{t:"💡 アクション",items:report.actions,c:P.a1}].map(s=>(
          <div key={s.t} style={{background:P.card,borderRadius:10,border:`1px solid ${P.border}`,padding:14}}>
            <div style={{fontSize:11,fontWeight:600,color:s.c,marginBottom:8}}>{s.t}</div>
            {(s.items||[]).map((it,i)=><div key={i} style={{fontSize:11,color:P.text,lineHeight:1.7,marginBottom:4,paddingLeft:10,position:"relative"}}><span style={{position:"absolute",left:0,color:s.c}}>•</span>{it}</div>)}
          </div>
        ))}
      </div>
    </div>}
  </div>;
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */
export default function App() {
  const [active, setActive] = useState("receipt");
  const [data, setData] = useState({ receipts:[], purchases:[], invoices:[], cashflow:[], expenses:[] });
  const [loaded, setLoaded] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const tab = TABS.find(t=>t.id===active);

  // load from storage
  useEffect(() => {
    (async () => {
      const stored = await loadStore();
      if (stored) setData(stored);
      setLoaded(true);
    })();
  }, []);

  // save on change
  useEffect(() => { if (loaded) saveStore(data); }, [data, loaded]);

  const setDataWrap = useCallback((fn) => {
    setData(prev => typeof fn === "function" ? fn(prev) : fn);
  }, []);

  const resetAll = () => { if (confirm("全データを削除しますか？")) { setData({receipts:[],purchases:[],invoices:[],cashflow:[],expenses:[]}); }};

  // totals for sidebar
  const totals = {
    receipt: (data.receipts||[]).length,
    purchase: (data.purchases||[]).length,
    invoice: (data.invoices||[]).length,
    cashflow: (data.cashflow||[]).length,
    expense: (data.expenses||[]).length,
    report: 0,
  };

  return (
    <div style={{fontFamily:"'Noto Sans JP','Helvetica Neue',sans-serif",background:P.bg,color:P.text,minHeight:"100vh",display:"flex",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:${P.border};border-radius:4px;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: sideOpen ? 210 : 56, background:P.surface, borderRight:`1px solid ${P.border}`,
        padding: sideOpen ? "16px 10px" : "16px 6px",
        display:"flex", flexDirection:"column", flexShrink:0, transition:"width .2s ease", overflow:"hidden",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,paddingLeft:2,cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>
          <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${P.a1},${P.a2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff",flexShrink:0}}>経</div>
          {sideOpen && <div style={{overflow:"hidden",whiteSpace:"nowrap"}}>
            <div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.02em"}}>経理AI Suite</div>
            <div style={{fontSize:8,color:P.muted,fontWeight:600,letterSpacing:1}}>ACCOUNTING AGENTS</div>
          </div>}
        </div>

        <div style={{flex:1}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActive(t.id)} title={t.label} style={{
              display:"flex",alignItems:"center",gap:10,width:"100%",
              padding:sideOpen?"9px 10px":"9px 0",justifyContent:sideOpen?"flex-start":"center",
              borderRadius:8,border:"none",cursor:"pointer",
              background:active===t.id?`${t.color}14`:"transparent",
              color:active===t.id?t.color:P.muted,
              fontSize:12,fontWeight:active===t.id?600:400,
              marginBottom:2,transition:"all .15s",textAlign:"left",
              borderLeft:sideOpen?(active===t.id?`3px solid ${t.color}`:"3px solid transparent"):"none",
            }}>
              <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
              {sideOpen && <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden"}}>{t.label}</span>}
              {sideOpen && totals[t.id]>0 && <span style={{fontSize:9,background:`${t.color}22`,color:t.color,padding:"1px 6px",borderRadius:8,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{totals[t.id]}</span>}
            </button>
          ))}
        </div>

        {sideOpen && <div style={{borderTop:`1px solid ${P.border}`,paddingTop:10}}>
          <button onClick={resetAll} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:`1px solid ${P.border}`,background:"transparent",color:P.dim,fontSize:10,cursor:"pointer",textAlign:"left"}}>🔄 データリセット</button>
          <div style={{fontSize:9,color:P.dim,marginTop:8,lineHeight:1.5,paddingLeft:2}}>⚠ AIの判定は参考値です。最終確認は必ず行ってください。</div>
        </div>}
      </div>

      {/* Main Content */}
      <div style={{flex:1,padding:"20px 28px",overflow:"auto"}}>
        <div style={{maxWidth:880,margin:"0 auto"}}>
          {/* Header */}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
              <span style={{fontSize:24}}>{tab.icon}</span>
              <h2 style={{fontSize:20,fontWeight:700,margin:0}}>{tab.label}</h2>
            </div>
            <p style={{fontSize:12,color:P.muted,marginLeft:38}}>{tab.desc}</p>
          </div>

          {/* Agent Content */}
          <div key={active} style={{animation:"fadeIn .3s ease"}}>
            {active==="receipt" && <ReceiptAgent data={data} setData={setDataWrap} />}
            {active==="purchase" && <PurchaseAgent data={data} setData={setDataWrap} />}
            {active==="invoice" && <InvoiceAgent data={data} setData={setDataWrap} />}
            {active==="cashflow" && <CashflowAgent data={data} setData={setDataWrap} />}
            {active==="expense" && <ExpenseAgent data={data} setData={setDataWrap} />}
            {active==="report" && <ReportAgent data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}
