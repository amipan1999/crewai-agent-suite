import { useState, useRef, useCallback, useEffect } from "react";

/* ─── palette & constants ─── */
const P = {
  bg: "#0a0e1a",
  surface: "#111827",
  card: "#1a2236",
  border: "#1f2b3f",
  text: "#e0e7ef",
  muted: "#7b8ba3",
  dim: "#4a5568",
  accent1: "#38bdf8",
  accent2: "#818cf8",
  accent3: "#34d399",
  accent4: "#fb923c",
  accent5: "#f472b6",
  accent6: "#facc15",
  danger: "#ef4444",
};

const AGENTS = [
  { id: "receipt", icon: "🧾", label: "領収書処理", color: P.accent1, desc: "領収書画像→自動仕訳" },
  { id: "purchase", icon: "📋", label: "発注書作成", color: P.accent2, desc: "発注書をAIで自動生成" },
  { id: "invoice", icon: "📄", label: "請求書作成", color: P.accent3, desc: "請求書をAIで自動生成" },
  { id: "cashflow", icon: "💰", label: "入出金管理", color: P.accent4, desc: "入出金を記録・集計" },
  { id: "expense", icon: "🗂", label: "経費精算", color: P.accent5, desc: "従業員の経費申請・承認" },
  { id: "report", icon: "📊", label: "月次レポート", color: P.accent6, desc: "月次の財務サマリーを生成" },
];

const CATEGORIES = [
  "旅費交通費","交際費","消耗品費","通信費","会議費","新聞図書費",
  "地代家賃","水道光熱費","広告宣伝費","雑費","福利厚生費","外注費","租税公課","修繕費",
];

const CAT_COLORS = {
  "旅費交通費":"#2563eb","交際費":"#dc2626","消耗品費":"#16a34a","通信費":"#9333ea",
  "会議費":"#ea580c","新聞図書費":"#0891b2","地代家賃":"#4f46e5","水道光熱費":"#ca8a04",
  "広告宣伝費":"#e11d48","雑費":"#6b7280","福利厚生費":"#059669","外注費":"#7c3aed",
  "租税公課":"#b91c1c","修繕費":"#0d9488",
};

const today = () => new Date().toISOString().slice(0,10);

const callAI = async (messages, system) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system, messages }),
  });
  const d = await res.json();
  return d.content?.map(c => c.text || "").join("") || "";
};

const parseJSON = (text) => {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

/* ─── shared UI components ─── */
const Btn = ({ children, onClick, color = P.accent1, small, disabled, style: sx }) => (
  <button disabled={disabled} onClick={onClick} style={{
    padding: small ? "5px 12px" : "8px 20px", borderRadius: 8, border: "none",
    background: disabled ? P.dim : color, color: "#fff", fontSize: small ? 12 : 13,
    fontWeight: 600, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "all .15s", ...sx,
  }}>{children}</button>
);

const Input = ({ label, value, onChange, type = "text", placeholder, textarea, options }) => (
  <div style={{ marginBottom: 10 }}>
    {label && <label style={{ fontSize: 11, color: P.muted, display: "block", marginBottom: 3, fontWeight: 500 }}>{label}</label>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
    ) : textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    )}
  </div>
);

const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${P.border}`,
  background: P.bg, color: P.text, fontSize: 13, outline: "none", fontFamily: "inherit",
};

const Card = ({ children, style: sx }) => (
  <div style={{ background: P.card, borderRadius: 12, border: `1px solid ${P.border}`, padding: 16, ...sx }}>{children}</div>
);

const StatBox = ({ label, value, color = P.accent1 }) => (
  <div style={{ background: P.surface, borderRadius: 10, padding: "12px 16px", border: `1px solid ${P.border}`, flex: 1, minWidth: 140 }}>
    <div style={{ fontSize: 10, color: P.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color }}>{value}</div>
  </div>
);

const Table = ({ columns, rows, onEdit, onDelete }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>{columns.map(c => <th key={c} style={{ textAlign: "left", padding: "8px 10px", color: P.muted, fontWeight: 600, borderBottom: `1px solid ${P.border}`, whiteSpace: "nowrap", fontSize: 11 }}>{c}</th>)}
          {(onEdit || onDelete) && <th style={{ padding: "8px 10px", borderBottom: `1px solid ${P.border}`, width: 60 }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${P.border}22` }}>
            {row.map((cell, j) => <td key={j} style={{ padding: "8px 10px", color: P.text, whiteSpace: "nowrap" }}>{cell}</td>)}
            {(onEdit || onDelete) && (
              <td style={{ padding: "8px 6px", display: "flex", gap: 4 }}>
                {onEdit && <button onClick={() => onEdit(i)} style={tblBtn}>✏️</button>}
                {onDelete && <button onClick={() => onDelete(i)} style={{ ...tblBtn, background: `${P.danger}22`, color: P.danger }}>🗑</button>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
    {rows.length === 0 && <div style={{ textAlign: "center", padding: 24, color: P.dim, fontSize: 13 }}>データなし</div>}
  </div>
);

const tblBtn = { width: 26, height: 26, borderRadius: 5, border: "none", background: `${P.accent1}22`, color: P.accent1, cursor: "pointer", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" };

const downloadCSV = (headers, rows, filename) => {
  const bom = "\uFEFF";
  const csv = bom + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = filename; a.click();
};

/* ══════════════════════════════════════════════════
   AGENT 1: 領収書処理
   ══════════════════════════════════════════════════ */
function ReceiptAgent() {
  const [entries, setEntries] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef();

  const process = async (file) => {
    setProcessing(true); setError(null);
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const text = await callAI([{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } }, { type: "text", text: "この領収書を読み取って仕訳してください。" }] }],
        `経理AIです。領収書画像からJSONのみ返してください。{"date":"YYYY-MM-DD","vendor":"店名","amount":数値,"tax":数値,"category":"勘定科目","description":"摘要","payment_method":"支払方法"} 勘定科目:${CATEGORIES.join(",")}`);
      const p = parseJSON(text);
      setEntries(prev => [{ id: Date.now(), ...p, img: URL.createObjectURL(file) }, ...prev]);
    } catch { setError("読み取り失敗。再度お試しください。"); }
    setProcessing(false);
  };

  return (
    <div>
      <div onClick={() => ref.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && process(e.dataTransfer.files[0]); }}
        style={{ border: `2px dashed ${P.border}`, borderRadius: 12, padding: processing ? 20 : 40, textAlign: "center", cursor: "pointer", background: `${P.surface}88`, marginBottom: 16, transition: "all .2s" }}>
        {processing ? <div style={{ color: P.accent1, fontWeight: 500 }}>🔍 AIが読み取り中...</div> : <>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
          <div style={{ color: P.muted, fontSize: 13 }}>領収書の画像をドロップまたはクリック</div>
        </>}
        <input ref={ref} type="file" accept="image/*" capture="environment" onChange={e => e.target.files[0] && process(e.target.files[0])} style={{ display: "none" }} />
      </div>
      {error && <div style={{ color: P.danger, fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>}
      {entries.length > 0 && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <StatBox label="合計" value={`¥${entries.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString()}`} />
          <StatBox label="件数" value={`${entries.length}件`} color={P.accent3} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Btn small onClick={() => downloadCSV(["日付","取引先","金額","税","科目","摘要","支払"], entries.map(e => [e.date,e.vendor,e.amount,e.tax,e.category,e.description,e.payment_method]), `領収書_${today()}.csv`)}>📥 CSV</Btn>
        </div>
        <Table columns={["日付","取引先","金額","科目","摘要"]}
          rows={entries.map(e => [e.date, e.vendor, `¥${Number(e.amount).toLocaleString()}`, e.category, e.description])}
          onDelete={i => setEntries(prev => prev.filter((_, j) => j !== i))} />
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AGENT 2: 発注書作成
   ══════════════════════════════════════════════════ */
function PurchaseOrderAgent() {
  const [form, setForm] = useState({ vendor: "", items: "", notes: "" });
  const [orders, setOrders] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const text = await callAI([{ role: "user", content: `以下の情報で発注書を作成:\n発注先: ${form.vendor}\n品目: ${form.items}\n備考: ${form.notes}\n本日: ${today()}` }],
        `発注書生成AIです。以下JSONのみ返してください。{"order_no":"PO-連番","date":"${today()}","vendor":"発注先","items":[{"name":"品名","quantity":数量,"unit":"個","unit_price":単価,"amount":小計}],"subtotal":小計合計,"tax":消費税,"total":合計,"notes":"備考","delivery_date":"納期"}`);
      const p = parseJSON(text);
      p.order_no = `PO-${String(orders.length + 1).padStart(4, "0")}`;
      setOrders(prev => [p, ...prev]);
      setPreview(p);
      setForm({ vendor: "", items: "", notes: "" });
    } catch(e) { console.error(e); }
    setGenerating(false);
  };

  return (
    <div>
      {preview ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: P.text, margin: 0 }}>発 注 書</h3>
            <span style={{ fontSize: 12, color: P.muted }}>{preview.order_no}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: P.muted, marginBottom: 12 }}>
            <div>発注先: <span style={{ color: P.text }}>{preview.vendor}</span></div>
            <div>発注日: <span style={{ color: P.text }}>{preview.date}</span></div>
            <div>納期: <span style={{ color: P.text }}>{preview.delivery_date || "未定"}</span></div>
          </div>
          <Table columns={["品名","数量","単価","小計"]} rows={(preview.items || []).map(it => [it.name, `${it.quantity} ${it.unit || ""}`, `¥${Number(it.unit_price).toLocaleString()}`, `¥${Number(it.amount).toLocaleString()}`])} />
          <div style={{ textAlign: "right", marginTop: 10, fontSize: 13 }}>
            <div style={{ color: P.muted }}>小計: ¥{Number(preview.subtotal).toLocaleString()}</div>
            <div style={{ color: P.muted }}>消費税: ¥{Number(preview.tax).toLocaleString()}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: P.accent2, fontFamily: "'JetBrains Mono', monospace" }}>合計: ¥{Number(preview.total).toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn small color={P.accent2} onClick={() => {
              downloadCSV(["発注No","日付","発注先","品名","数量","単価","小計"], (preview.items||[]).map(it => [preview.order_no,preview.date,preview.vendor,it.name,it.quantity,it.unit_price,it.amount]), `発注書_${preview.order_no}.csv`);
            }}>📥 CSV</Btn>
            <Btn small color={P.dim} onClick={() => setPreview(null)}>閉じる</Btn>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <Input label="発注先" value={form.vendor} onChange={v => setForm(f => ({ ...f, vendor: v }))} placeholder="株式会社〇〇" />
          <Input label="品目・数量（自由入力）" value={form.items} onChange={v => setForm(f => ({ ...f, items: v }))} textarea placeholder="例: ノートPC 3台、マウス 5個、モニター 2台" />
          <Input label="備考" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="納期希望など" />
          <Btn color={P.accent2} onClick={generate} disabled={generating || !form.vendor || !form.items}>{generating ? "生成中..." : "🤖 AIで発注書を生成"}</Btn>
        </Card>
      )}
      {orders.length > 0 && <>
        <div style={{ fontSize: 13, fontWeight: 600, color: P.muted, marginBottom: 8 }}>発注履歴</div>
        <Table columns={["No","日付","発注先","合計"]} rows={orders.map(o => [o.order_no, o.date, o.vendor, `¥${Number(o.total).toLocaleString()}`])}
          onEdit={i => setPreview(orders[i])} />
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AGENT 3: 請求書作成
   ══════════════════════════════════════════════════ */
function InvoiceAgent() {
  const [form, setForm] = useState({ client: "", items: "", due: "", notes: "" });
  const [invoices, setInvoices] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const text = await callAI([{ role: "user", content: `請求書作成:\n請求先: ${form.client}\n品目: ${form.items}\n支払期限: ${form.due}\n備考: ${form.notes}\n本日: ${today()}` }],
        `請求書生成AIです。JSONのみ返してください。{"invoice_no":"INV-連番","date":"${today()}","client":"請求先","items":[{"name":"品名","quantity":数量,"unit":"式","unit_price":単価,"amount":小計}],"subtotal":数値,"tax":数値,"total":数値,"due_date":"支払期限","bank":"振込先(適当に)","notes":"備考"}`);
      const p = parseJSON(text);
      p.invoice_no = `INV-${String(invoices.length + 1).padStart(4, "0")}`;
      setInvoices(prev => [p, ...prev]);
      setPreview(p);
      setForm({ client: "", items: "", due: "", notes: "" });
    } catch(e) { console.error(e); }
    setGenerating(false);
  };

  return (
    <div>
      {preview ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: P.text, margin: 0 }}>請 求 書</h3>
            <span style={{ fontSize: 12, color: P.muted }}>{preview.invoice_no}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: P.muted, marginBottom: 12 }}>
            <div>請求先: <span style={{ color: P.text }}>{preview.client}</span></div>
            <div>発行日: <span style={{ color: P.text }}>{preview.date}</span></div>
            <div>支払期限: <span style={{ color: P.text }}>{preview.due_date}</span></div>
            <div>振込先: <span style={{ color: P.text }}>{preview.bank}</span></div>
          </div>
          <Table columns={["品名","数量","単価","小計"]} rows={(preview.items || []).map(it => [it.name, `${it.quantity} ${it.unit || ""}`, `¥${Number(it.unit_price).toLocaleString()}`, `¥${Number(it.amount).toLocaleString()}`])} />
          <div style={{ textAlign: "right", marginTop: 10, fontSize: 13 }}>
            <div style={{ color: P.muted }}>小計: ¥{Number(preview.subtotal).toLocaleString()}</div>
            <div style={{ color: P.muted }}>消費税: ¥{Number(preview.tax).toLocaleString()}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: P.accent3, fontFamily: "'JetBrains Mono', monospace" }}>合計: ¥{Number(preview.total).toLocaleString()}</div>
          </div>
          {preview.notes && <div style={{ marginTop: 8, fontSize: 11, color: P.muted }}>備考: {preview.notes}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn small color={P.accent3} onClick={() => {
              downloadCSV(["請求No","日付","請求先","品名","数量","単価","小計","支払期限"], (preview.items||[]).map(it => [preview.invoice_no,preview.date,preview.client,it.name,it.quantity,it.unit_price,it.amount,preview.due_date]), `請求書_${preview.invoice_no}.csv`);
            }}>📥 CSV</Btn>
            <Btn small color={P.dim} onClick={() => setPreview(null)}>閉じる</Btn>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <Input label="請求先" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="株式会社〇〇" />
          <Input label="品目・金額（自由入力）" value={form.items} onChange={v => setForm(f => ({ ...f, items: v }))} textarea placeholder="例: Webサイト制作 1式 500,000円、バナーデザイン 3点 各30,000円" />
          <Input label="支払期限" value={form.due} onChange={v => setForm(f => ({ ...f, due: v }))} type="date" />
          <Input label="備考" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="振込手数料はご負担ください 等" />
          <Btn color={P.accent3} onClick={generate} disabled={generating || !form.client || !form.items}>{generating ? "生成中..." : "🤖 AIで請求書を生成"}</Btn>
        </Card>
      )}
      {invoices.length > 0 && !preview && <>
        <div style={{ fontSize: 13, fontWeight: 600, color: P.muted, marginBottom: 8 }}>請求履歴</div>
        <Table columns={["No","日付","請求先","合計","期限"]} rows={invoices.map(o => [o.invoice_no, o.date, o.client, `¥${Number(o.total).toLocaleString()}`, o.due_date])}
          onEdit={i => setPreview(invoices[i])} />
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AGENT 4: 入出金管理
   ══════════════════════════════════════════════════ */
function CashflowAgent() {
  const [txns, setTxns] = useState([]);
  const [form, setForm] = useState({ date: today(), type: "入金", category: "売上", counterparty: "", amount: "", note: "" });

  const add = () => {
    if (!form.amount || !form.counterparty) return;
    setTxns(prev => [{ id: Date.now(), ...form, amount: Number(form.amount) }, ...prev]);
    setForm({ date: today(), type: "入金", category: "売上", counterparty: "", amount: "", note: "" });
  };

  const income = txns.filter(t => t.type === "入金").reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === "出金").reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Input label="日付" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} type="date" />
          <Input label="種別" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={["入金", "出金"]} />
          <Input label="相手先" value={form.counterparty} onChange={v => setForm(f => ({ ...f, counterparty: v }))} placeholder="取引先名" />
          <Input label="金額" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" placeholder="10000" />
          <Input label="分類" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={["売上","仕入","給与","家賃","光熱費","通信費","その他"]} />
          <Input label="メモ" value={form.note} onChange={v => setForm(f => ({ ...f, note: v }))} placeholder="補足" />
        </div>
        <Btn color={P.accent4} onClick={add} disabled={!form.amount || !form.counterparty}>➕ 記録</Btn>
      </Card>
      {txns.length > 0 && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <StatBox label="入金合計" value={`¥${income.toLocaleString()}`} color={P.accent3} />
          <StatBox label="出金合計" value={`¥${expense.toLocaleString()}`} color={P.danger} />
          <StatBox label="収支" value={`¥${(income - expense).toLocaleString()}`} color={income - expense >= 0 ? P.accent3 : P.danger} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Btn small color={P.accent4} onClick={() => downloadCSV(["日付","種別","相手先","金額","分類","メモ"], txns.map(t => [t.date,t.type,t.counterparty,t.amount,t.category,t.note]), `入出金_${today()}.csv`)}>📥 CSV</Btn>
        </div>
        <Table columns={["日付","種別","相手先","金額","分類"]}
          rows={txns.map(t => [t.date, <span style={{ color: t.type === "入金" ? P.accent3 : P.danger, fontWeight: 600 }}>{t.type}</span>, t.counterparty, `¥${t.amount.toLocaleString()}`, t.category])}
          onDelete={i => setTxns(prev => prev.filter((_, j) => j !== i))} />
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AGENT 5: 経費精算
   ══════════════════════════════════════════════════ */
function ExpenseAgent() {
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState({ date: today(), applicant: "", category: CATEGORIES[0], amount: "", description: "", receipt: false });

  const submit = () => {
    if (!form.amount || !form.applicant) return;
    setClaims(prev => [{ id: Date.now(), ...form, amount: Number(form.amount), status: "申請中" }, ...prev]);
    setForm({ date: today(), applicant: "", category: CATEGORIES[0], amount: "", description: "", receipt: false });
  };

  const approve = (i) => setClaims(prev => prev.map((c, j) => j === i ? { ...c, status: "承認済" } : c));
  const reject = (i) => setClaims(prev => prev.map((c, j) => j === i ? { ...c, status: "差戻し" } : c));
  const total = claims.filter(c => c.status === "承認済").reduce((s, c) => s + c.amount, 0);
  const pending = claims.filter(c => c.status === "申請中").length;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Input label="申請日" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} type="date" />
          <Input label="申請者" value={form.applicant} onChange={v => setForm(f => ({ ...f, applicant: v }))} placeholder="山田太郎" />
          <Input label="勘定科目" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES} />
          <Input label="金額" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" placeholder="5000" />
        </div>
        <Input label="内容" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="クライアント打合せ タクシー代" />
        <Btn color={P.accent5} onClick={submit} disabled={!form.amount || !form.applicant}>📝 申請</Btn>
      </Card>
      {claims.length > 0 && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <StatBox label="承認済合計" value={`¥${total.toLocaleString()}`} color={P.accent3} />
          <StatBox label="未承認" value={`${pending}件`} color={P.accent5} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Btn small color={P.accent5} onClick={() => downloadCSV(["日付","申請者","科目","金額","内容","ステータス"], claims.map(c => [c.date,c.applicant,c.category,c.amount,c.description,c.status]), `経費精算_${today()}.csv`)}>📥 CSV</Btn>
        </div>
        {claims.map((c, i) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: P.surface, border: `1px solid ${P.border}`, marginBottom: 6, gap: 10, fontSize: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: P.text, marginBottom: 2 }}>{c.applicant} - {c.description}</div>
              <div style={{ color: P.muted }}>{c.date} / {c.category}</div>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: P.text, marginRight: 8 }}>¥{c.amount.toLocaleString()}</div>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: c.status === "承認済" ? `${P.accent3}22` : c.status === "差戻し" ? `${P.danger}22` : `${P.accent6}22`, color: c.status === "承認済" ? P.accent3 : c.status === "差戻し" ? P.danger : P.accent6 }}>{c.status}</span>
            {c.status === "申請中" && <>
              <button onClick={() => approve(i)} style={{ ...tblBtn, background: `${P.accent3}22`, color: P.accent3 }}>✓</button>
              <button onClick={() => reject(i)} style={{ ...tblBtn, background: `${P.danger}22`, color: P.danger }}>✗</button>
            </>}
          </div>
        ))}
      </>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   AGENT 6: 月次レポート
   ══════════════════════════════════════════════════ */
function ReportAgent({ allData }) {
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));

  const generate = async () => {
    setGenerating(true);
    try {
      const summary = JSON.stringify(allData);
      const text = await callAI([{ role: "user", content: `以下は${month}の経理データです。月次レポートを作成してください:\n${summary}` }],
        `月次レポート生成AIです。JSONのみ返してください。{"month":"${month}","summary":"全体概要(200文字)","total_income":入金合計数値,"total_expense":出金合計数値,"profit":利益数値,"category_breakdown":[{"category":"科目","amount":数値}],"highlights":["注目ポイント1","注目ポイント2","注目ポイント3"],"risks":["リスク1","リスク2"],"recommendations":["提言1","提言2"]}`);
      setReport(parseJSON(text));
    } catch(e) { console.error(e); }
    setGenerating(false);
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Input label="対象月" value={month} onChange={setMonth} type="month" />
        <Btn color={P.accent6} onClick={generate} disabled={generating}>{generating ? "AIが分析中..." : "📊 月次レポート生成"}</Btn>
      </Card>
      {report && (
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <StatBox label="収入" value={`¥${Number(report.total_income).toLocaleString()}`} color={P.accent3} />
            <StatBox label="支出" value={`¥${Number(report.total_expense).toLocaleString()}`} color={P.danger} />
            <StatBox label="利益" value={`¥${Number(report.profit).toLocaleString()}`} color={Number(report.profit) >= 0 ? P.accent1 : P.danger} />
          </div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: P.accent6, marginBottom: 6 }}>📝 概要</div>
            <div style={{ fontSize: 13, color: P.text, lineHeight: 1.7 }}>{report.summary}</div>
          </Card>
          {report.category_breakdown?.length > 0 && (
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.accent6, marginBottom: 8 }}>📂 科目別内訳</div>
              {report.category_breakdown.map((c, i) => {
                const max = Math.max(...report.category_breakdown.map(x => x.amount));
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ color: P.text }}>{c.category}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: P.muted }}>¥{Number(c.amount).toLocaleString()}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: P.border }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${(c.amount / max) * 100}%`, background: CAT_COLORS[c.category] || P.accent2, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[{ title: "🌟 注目ポイント", items: report.highlights, color: P.accent3 },
              { title: "⚠ リスク", items: report.risks, color: P.accent4 },
              { title: "💡 提言", items: report.recommendations, color: P.accent1 },
            ].map(sec => (
              <Card key={sec.title} style={{ padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: sec.color, marginBottom: 6 }}>{sec.title}</div>
                {(sec.items || []).map((it, i) => <div key={i} style={{ fontSize: 11, color: P.text, lineHeight: 1.6, marginBottom: 4 }}>• {it}</div>)}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════ */
export default function AccountingDashboard() {
  const [active, setActive] = useState("receipt");
  const agent = AGENTS.find(a => a.id === active);

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Helvetica Neue', sans-serif", background: P.bg, color: P.text, minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${P.border}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: P.surface, borderRight: `1px solid ${P.border}`, padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, paddingLeft: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${P.accent1}, ${P.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>経</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>経理AI</div>
            <div style={{ fontSize: 9, color: P.muted, fontWeight: 500 }}>ACCOUNTING AGENT</div>
          </div>
        </div>

        {AGENTS.map(a => (
          <button key={a.id} onClick={() => setActive(a.id)} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            background: active === a.id ? `${a.color}18` : "transparent",
            color: active === a.id ? a.color : P.muted,
            fontSize: 13, fontWeight: active === a.id ? 600 : 400,
            marginBottom: 2, transition: "all .15s", textAlign: "left",
            borderLeft: active === a.id ? `3px solid ${a.color}` : "3px solid transparent",
          }}>
            <span style={{ fontSize: 16 }}>{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${P.border}`, fontSize: 10, color: P.dim, lineHeight: 1.5 }}>
          ⚠ AIの判定は参考値です。<br />最終確認は必ず行ってください。
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "24px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 24 }}>{agent.icon}</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: P.text, margin: 0 }}>{agent.label}</h2>
            </div>
            <p style={{ fontSize: 13, color: P.muted, marginLeft: 36 }}>{agent.desc}</p>
          </div>

          <div style={{ animation: "fadeIn .3s ease" }} key={active}>
            {active === "receipt" && <ReceiptAgent />}
            {active === "purchase" && <PurchaseOrderAgent />}
            {active === "invoice" && <InvoiceAgent />}
            {active === "cashflow" && <CashflowAgent />}
            {active === "expense" && <ExpenseAgent />}
            {active === "report" && <ReportAgent allData={{}} />}
          </div>
        </div>
      </div>
    </div>
  );
}
