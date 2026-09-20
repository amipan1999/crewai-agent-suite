import { api } from "../api.js";
import { state, esc, yen, num, today, toast, openModal, confirmDialog, setError, partnerDatalist, accountOptions } from "../ui.js";
import { openEvidenceDetail } from "./evidence.js";
import { loadMeta } from "../app.js";

const STATUS = { draft: ["下書き", "gray"], issued: ["発行済（未入金）", "amber"], paid: ["入金済", "green"] };

export async function renderInvoices(main) {
  main.innerHTML = `
    <div class="page-head">
      <h1>請求書の発行 <span class="muted small">${state.year}年</span></h1>
      <div class="actions"><button class="btn primary" id="btn-new-invoice">＋ 請求書を作成</button></div>
    </div>
    <div class="info-box">発行すると「売掛金 / 売上高」の仕訳が自動で作られ、入金登録で「普通預金 / 売掛金」の仕訳が追加されます。送付したPDFは「控えを添付」で証跡として保存できます。</div>
    <div class="panel"><div class="table-wrap" id="inv-table"></div></div>`;
  main.querySelector("#btn-new-invoice").addEventListener("click", () => openInvoiceForm(null, () => loadTable(main)));
  await loadTable(main);
}

async function loadTable(main) {
  const items = await api.get("/api/invoices", { year: state.year });
  const wrap = main.querySelector("#inv-table");
  if (!items.length) { wrap.innerHTML = `<div class="empty">請求書がありません</div>`; return; }
  wrap.innerHTML = `<table class="data">
    <thead><tr><th>番号</th><th>請求日</th><th>支払期限</th><th>宛先</th><th>件名</th><th class="num">税込金額</th><th>状態</th><th>控え</th><th></th></tr></thead>
    <tbody>${items.map((inv) => `<tr>
      <td class="mono nowrap">${esc(inv.invoice_no)}</td><td class="nowrap">${esc(inv.issue_date)}</td><td class="nowrap">${esc(inv.due_date)}</td>
      <td>${esc(inv.partner_name)}</td><td>${esc(inv.subject)}</td><td class="num">${yen(inv.total)}</td>
      <td><span class="badge ${STATUS[inv.status][1]}">${STATUS[inv.status][0]}</span>${inv.paid_date ? `<div class="muted small">${esc(inv.paid_date)}</div>` : ""}</td>
      <td>${inv.evidence_id ? `<button class="chip" data-ev="${inv.evidence_id}">証跡 #${inv.evidence_id}</button>` : `<button class="btn small" data-attach="${inv.id}">控えを添付</button>`}</td>
      <td class="nowrap">
        <a class="btn small" href="#/invoices/${inv.id}/print">印刷/PDF</a>
        <button class="btn small" data-edit="${inv.id}">編集</button>
        ${inv.status === "draft" ? `<button class="btn small primary" data-status="issued" data-id="${inv.id}">発行</button>` : ""}
        ${inv.status === "issued" ? `<button class="btn small primary" data-paid="${inv.id}">入金登録</button> <button class="btn small" data-status="draft" data-id="${inv.id}">下書きに戻す</button>` : ""}
        ${inv.status === "paid" ? `<button class="btn small" data-status="issued" data-id="${inv.id}">入金を取消</button>` : ""}
        <button class="btn small danger" data-del="${inv.id}">削除</button>
      </td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="5">合計 ${items.length} 件</td><td class="num">${yen(items.reduce((s, i) => s + i.total, 0))}</td><td colspan="3"></td></tr></tfoot>
  </table>`;
  const reload = () => loadTable(main);
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openInvoiceForm(items.find((i) => i.id === Number(b.dataset.edit)), reload)));
  wrap.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await api.post(`/api/invoices/${b.dataset.id}/status`, { status: b.dataset.status });
      toast("状態を更新しました", "ok");
      reload();
    } catch (err) { toast(err.message, "error"); }
  }));
  wrap.querySelectorAll("[data-paid]").forEach((b) => b.addEventListener("click", () => openPaidDialog(items.find((i) => i.id === Number(b.dataset.paid)), reload)));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog("この請求書を削除しますか？関連する売上・入金の仕訳も削除されます。"))) return;
    await api.del(`/api/invoices/${b.dataset.del}`);
    toast("削除しました", "ok");
    reload();
  }));
  wrap.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => openEvidenceDetail(Number(b.dataset.ev), reload)));
  wrap.querySelectorAll("[data-attach]").forEach((b) => b.addEventListener("click", () => openAttachDialog(Number(b.dataset.attach), reload)));
}

function itemRow(it = {}) {
  return `<tr>
    <td><input type="text" name="description" value="${esc(it.description || "")}" placeholder="品目・作業内容"></td>
    <td style="width:80px"><input type="number" name="quantity" step="0.01" value="${esc(it.quantity ?? 1)}"></td>
    <td style="width:70px"><input type="text" name="unit" value="${esc(it.unit || "")}" placeholder="式"></td>
    <td style="width:120px"><input type="number" name="unit_price" value="${esc(it.unit_price ?? "")}"></td>
    <td style="width:90px"><select name="tax_rate"><option value="10" ${(it.tax_rate ?? 10) == 10 ? "selected" : ""}>10%</option><option value="8" ${it.tax_rate == 8 ? "selected" : ""}>8%</option><option value="0" ${it.tax_rate == 0 ? "selected" : ""}>0%</option></select></td>
    <td class="num nowrap" data-line></td>
    <td><button type="button" class="btn ghost small" data-remove>✕</button></td>
  </tr>`;
}

function readItems(form) {
  return [...form.querySelectorAll("tbody tr")].map((tr) => ({
    description: tr.querySelector("[name=description]").value,
    quantity: Number(tr.querySelector("[name=quantity]").value || 0),
    unit: tr.querySelector("[name=unit]").value,
    unit_price: Number(tr.querySelector("[name=unit_price]").value || 0),
    tax_rate: Number(tr.querySelector("[name=tax_rate]").value),
  })).filter((i) => i.description || i.unit_price);
}

function totals(items) {
  const byRate = {};
  for (const i of items) {
    const line = Math.round(i.quantity * i.unit_price);
    byRate[i.tax_rate] = (byRate[i.tax_rate] || 0) + line;
  }
  let subtotal = 0, tax = 0;
  for (const [rate, net] of Object.entries(byRate)) { subtotal += net; tax += Math.floor(net * Number(rate) / 100); }
  return { subtotal, tax, total: subtotal + tax, byRate };
}

export function openInvoiceForm(inv, onSaved) {
  const s = state.meta?.settings || {};
  const d = inv || { issue_date: today(), due_date: "", items: [{}], note: s.invoice_note || "", partner_name: "", partner_address: "", subject: "" };
  const m = openModal({
    title: inv ? `請求書を編集 ${inv.invoice_no}` : "請求書を作成",
    wide: true,
    body: `<form id="inv-form">
      <div class="form-grid">
        <label>請求書番号 <input type="text" name="invoice_no" value="${esc(d.invoice_no || "")}" placeholder="空欄なら自動採番（${esc(s.invoice_prefix || "INV-")}${state.year}-0001 形式）"></label>
        <label>件名 <input type="text" name="subject" value="${esc(d.subject)}" placeholder="例: 9月分 Web開発業務"></label>
        <label>宛先（取引先） <input type="text" name="partner_name" list="partner-list" value="${esc(d.partner_name)}" required>${partnerDatalist()}</label>
        <label>宛先住所（任意） <input type="text" name="partner_address" value="${esc(d.partner_address)}"></label>
        <label>請求日 <input type="date" name="issue_date" value="${esc(d.issue_date)}" required></label>
        <label>お支払期限 <input type="date" name="due_date" value="${esc(d.due_date)}"></label>
      </div>
      <h4 style="margin:16px 0 6px">明細</h4>
      <table class="data items-table"><thead><tr><th>内容</th><th>数量</th><th>単位</th><th>単価（税抜）</th><th>税率</th><th class="num">金額</th><th></th></tr></thead>
      <tbody>${(d.items.length ? d.items : [{}]).map(itemRow).join("")}</tbody></table>
      <button type="button" class="btn small" id="add-item" style="margin-top:6px">＋ 行を追加</button>
      <div class="totals" id="inv-totals"></div>
      <label class="field" style="margin-top:10px">備考 <textarea name="note">${esc(d.note)}</textarea></label>
    </form>`,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="inv-save">${inv ? "更新" : "保存（下書き）"}</button>`,
  });
  const form = m.body.querySelector("#inv-form");
  const recalc = () => {
    const items = readItems(form);
    form.querySelectorAll("tbody tr").forEach((tr) => {
      const q = Number(tr.querySelector("[name=quantity]").value || 0), p = Number(tr.querySelector("[name=unit_price]").value || 0);
      tr.querySelector("[data-line]").textContent = q && p ? num(Math.round(q * p)) : "";
    });
    const t = totals(items);
    m.body.querySelector("#inv-totals").innerHTML = `<span class="muted">小計（税抜）</span><span>${yen(t.subtotal)}</span>
      ${Object.entries(t.byRate).map(([r, n]) => `<span class="muted">消費税 ${r}%（対象 ${yen(n)}）</span><span>${yen(Math.floor(n * Number(r) / 100))}</span>`).join("")}
      <span class="grand">合計（税込）</span><span class="grand">${yen(t.total)}</span>`;
  };
  form.addEventListener("input", recalc);
  form.addEventListener("click", (e) => { const b = e.target.closest("[data-remove]"); if (b) { b.closest("tr").remove(); recalc(); } });
  m.body.querySelector("#add-item").addEventListener("click", () => { form.querySelector("tbody").insertAdjacentHTML("beforeend", itemRow()); });
  recalc();
  m.el.querySelector("#inv-save").addEventListener("click", async () => {
    const payload = {
      invoice_no: form.invoice_no.value || null, subject: form.subject.value, partner_name: form.partner_name.value, partner_address: form.partner_address.value,
      issue_date: form.issue_date.value, due_date: form.due_date.value, items: readItems(form), note: form.note.value,
    };
    if (!payload.partner_name || !payload.issue_date) { setError(m.body, "宛先と請求日は必須です"); return; }
    try {
      if (inv) await api.put(`/api/invoices/${inv.id}`, payload); else await api.post("/api/invoices", payload);
      toast("保存しました", "ok");
      m.close();
      await loadMeta();
      onSaved && onSaved();
    } catch (err) { setError(m.body, err.message); }
  });
}

function openPaidDialog(inv, onDone) {
  const s = state.meta?.settings || {};
  const m = openModal({
    title: `入金登録 ${inv.invoice_no}`,
    body: `<form id="paid-form" class="form-grid">
      <label>入金日 <input type="date" name="paid_date" value="${today()}"></label>
      <label>入金先口座 <select name="deposit_account">${accountOptions(s.default_deposit_account || "普通預金", { categories: ["asset"] })}</select></label>
      <label>差し引かれた振込手数料（円） <input type="number" name="fee_amount" value="0" min="0"></label>
      <div class="field"><span>請求金額</span><strong style="font-size:16px">${yen(inv.total)}</strong></div>
    </form>`,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="paid-go">入金を登録</button>`,
  });
  m.el.querySelector("#paid-go").addEventListener("click", async () => {
    const f = m.body.querySelector("#paid-form");
    try {
      await api.post(`/api/invoices/${inv.id}/status`, { status: "paid", paid_date: f.paid_date.value, deposit_account: f.deposit_account.value, fee_amount: Number(f.fee_amount.value || 0) });
      toast("入金を登録しました", "ok");
      m.close();
      onDone && onDone();
    } catch (err) { setError(m.body, err.message); }
  });
}

async function openAttachDialog(invoiceId, onDone) {
  const unlinked = await api.get("/api/evidence", { linked: "false", limit: 200 });
  const m = openModal({
    title: "請求書の控えを添付",
    body: `<div class="form-grid">
      <label class="full">新しくファイルをアップロード <input type="file" id="att-file" accept="image/*,.pdf"></label>
      <label class="full">または登録済みの証跡から選ぶ <select id="att-select"><option value="">選択…</option>${unlinked.items.map((e) => `<option value="${e.id}">#${e.id} ${esc(e.doc_date)} ${esc(e.vendor || e.original_name)}</option>`).join("")}</select></label>
    </div>`,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="att-go">添付</button>`,
  });
  m.el.querySelector("#att-go").addEventListener("click", async () => {
    try {
      let evId = Number(m.body.querySelector("#att-select").value);
      const file = m.body.querySelector("#att-file").files[0];
      if (file) {
        const r = await api.upload("/api/evidence", file, { kind: "invoice_issued", run_ocr_now: "false", allow_duplicate: "true" });
        evId = r.evidence.id;
      }
      if (!evId) { setError(m.body, "ファイルを選択してください"); return; }
      await api.post(`/api/invoices/${invoiceId}/attach/${evId}`);
      toast("控えを添付しました", "ok");
      m.close();
      onDone && onDone();
    } catch (err) { setError(m.body, err.message); }
  });
}

export async function renderInvoicePrint(main, id) {
  const inv = await api.get(`/api/invoices/${id}`);
  const s = state.meta?.settings || {};
  const t = totals(inv.items);
  main.innerHTML = `
    <div class="row no-print" style="margin-bottom:12px; justify-content:space-between">
      <a class="btn" href="#/invoices">← 一覧に戻る</a>
      <div class="row"><span class="muted small">ブラウザの印刷ダイアログで「PDFに保存」を選ぶとPDFになります</span><button class="btn primary" onclick="window.print()">印刷 / PDF保存</button></div>
    </div>
    <div class="invoice-sheet">
      <h1>請求書</h1>
      <div class="meta">
        <div>
          <div class="to">${esc(inv.partner_name)} 御中</div>
          ${inv.partner_address ? `<div class="small">${esc(inv.partner_address)}</div>` : ""}
          <div style="margin-top:14px">下記のとおりご請求申し上げます。</div>
          <div class="total-box">ご請求金額 ${yen(inv.total)}（税込）</div>
          ${inv.subject ? `<div>件名: ${esc(inv.subject)}</div>` : ""}
          ${inv.due_date ? `<div>お支払期限: ${esc(inv.due_date)}</div>` : ""}
        </div>
        <div class="from">
          <div>請求書番号: ${esc(inv.invoice_no)}</div>
          <div>請求日: ${esc(inv.issue_date)}</div>
          <div style="margin-top:12px; font-size:14px; font-weight:600">${esc(s.business_name || s.owner_name || "")}</div>
          ${s.business_name && s.owner_name ? `<div>${esc(s.owner_name)}</div>` : ""}
          ${s.address ? `<div>${esc(s.address).replace(/\n/g, "<br>")}</div>` : ""}
          ${s.owner_email ? `<div>${esc(s.owner_email)}</div>` : ""}
          ${s.invoice_registration_number ? `<div>登録番号: ${esc(s.invoice_registration_number)}</div>` : ""}
        </div>
      </div>
      <table>
        <thead><tr><th>内容</th><th style="width:70px">数量</th><th style="width:60px">単位</th><th style="width:110px">単価</th><th style="width:60px">税率</th><th style="width:120px">金額（税抜）</th></tr></thead>
        <tbody>${inv.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${num(i.quantity)}</td><td>${esc(i.unit)}</td><td class="num">${num(i.unit_price)}</td><td class="num">${i.tax_rate}%</td><td class="num">${num(Math.round(i.quantity * i.unit_price))}</td></tr>`).join("")}</tbody>
      </table>
      <table style="width:auto; margin-left:auto">
        <tbody>
          <tr><th>小計（税抜）</th><td class="num" style="width:140px">${yen(t.subtotal)}</td></tr>
          ${Object.entries(t.byRate).map(([r, n]) => `<tr><th>${r}%対象 ${yen(n)} 消費税</th><td class="num">${yen(Math.floor(n * Number(r) / 100))}</td></tr>`).join("")}
          <tr><th>合計（税込）</th><td class="num"><strong>${yen(inv.total)}</strong></td></tr>
        </tbody>
      </table>
      ${s.bank_info ? `<div style="margin-top:12px"><strong>お振込先</strong><div style="white-space:pre-wrap">${esc(s.bank_info)}</div></div>` : ""}
      ${inv.note ? `<div class="note">${esc(inv.note)}</div>` : ""}
    </div>`;
}
