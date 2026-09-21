import { api } from "../api.js";
import { state, esc, yen, today, toast, openModal, confirmDialog, formValues, setError, accountOptions, taxOptions, partnerDatalist, defaultTaxFor, accountCategory, monthOptions } from "../ui.js";
import { openEvidenceDetail } from "./evidence.js";
import { loadMeta } from "../app.js";

const filters = { month: "", account: "", q: "" };

export async function renderJournal(main) {
  main.innerHTML = `
    <div class="page-head">
      <h1>仕訳帳 <span class="muted small">${state.year}年</span></h1>
      <div class="actions">
        <button class="btn" id="btn-quick-sale">売上を記帳</button>
        <button class="btn primary" id="btn-new-entry">＋ 仕訳を追加</button>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <label>月<select id="f-month">${monthOptions(filters.month)}</select></label>
        <label>勘定科目<select id="f-account"><option value="">すべて</option>${accountOptions(filters.account)}</select></label>
        <label>検索<input type="text" id="f-q" placeholder="取引先・摘要・品目" value="${esc(filters.q)}"></label>
        <span class="spacer"></span>
        <span class="muted small" id="entry-count"></span>
      </div>
      <div class="table-wrap" id="entry-table"></div>
    </div>`;
  main.querySelector("#btn-new-entry").addEventListener("click", () => openEntryForm({}, () => loadTable(main)));
  main.querySelector("#btn-quick-sale").addEventListener("click", () => openEntryForm({ preset: "sale" }, () => loadTable(main)));
  main.querySelector("#f-month").addEventListener("change", (e) => { filters.month = e.target.value; loadTable(main); });
  main.querySelector("#f-account").addEventListener("change", (e) => { filters.account = e.target.value; loadTable(main); });
  let t;
  main.querySelector("#f-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { filters.q = e.target.value; loadTable(main); }, 300); });
  await loadTable(main);
}

async function loadTable(main) {
  const wrap = main.querySelector("#entry-table");
  const data = await api.get("/api/entries", { year: state.year, month: filters.month, account: filters.account, q: filters.q, limit: 2000 });
  main.querySelector("#entry-count").textContent = `${data.total} 件`;
  wrap.innerHTML = entriesTable(data.items);
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
    const entry = await api.get(`/api/entries/${b.dataset.edit}`);
    openEntryForm({ entry }, () => loadTable(main));
  }));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog("この仕訳を削除しますか？（証跡ファイルは残ります）"))) return;
    await api.del(`/api/entries/${b.dataset.del}`);
    toast("仕訳を削除しました", "ok");
    loadTable(main);
  }));
  wrap.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => openEvidenceDetail(Number(b.dataset.ev), () => loadTable(main))));
}

export function entriesTable(items, { compact = false } = {}) {
  if (!items.length) return `<div class="empty">仕訳がありません。「＋ 仕訳を追加」または証跡のアップロードから登録できます。</div>`;
  const total = items.reduce((s, e) => s + (e.debit_amount || e.credit_amount || 0), 0);
  const rows = items.map((e) => `
    <tr>
      <td class="nowrap">${esc(e.date)}</td>
      <td>${esc(e.debit_account || "—")}<div class="muted small">${esc(e.debit_tax_category !== "対象外" ? e.debit_tax_category : "")}</div></td>
      <td>${esc(e.credit_account || "—")}<div class="muted small">${esc(e.credit_tax_category !== "対象外" ? e.credit_tax_category : "")}</div></td>
      <td class="num">${yen(e.debit_amount || e.credit_amount)}</td>
      <td>${esc(e.debit_partner || e.credit_partner)}</td>
      <td>${esc(e.description)}${e.debit_item ? `<div class="muted small">品目: ${esc(e.debit_item)}</div>` : ""}</td>
      <td>${(e.evidence || []).map((v) => `<button class="chip" data-ev="${v.id}" title="${esc(v.original_name)}">${v.mime === "application/pdf" ? "PDF" : "IMG"}</button>`).join(" ")}
          ${e.source === "ocr" ? `<span class="badge gray" title="OCRから作成">OCR</span>` : ""}${e.source === "invoice" ? `<span class="badge gray">請求書</span>` : ""}${e.source === "import" ? `<span class="badge gray">取込</span>` : ""}</td>
      ${compact ? "" : `<td class="nowrap"><button class="btn small" data-edit="${e.id}">編集</button> <button class="btn small danger" data-del="${e.id}">削除</button></td>`}
    </tr>`).join("");
  return `<table class="data">
    <thead><tr><th>取引日</th><th>借方</th><th>貸方</th><th class="num">金額</th><th>取引先</th><th>取引内容</th><th>証跡</th>${compact ? "" : "<th></th>"}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">合計 ${items.length} 件</td><td class="num">${yen(total)}</td><td colspan="${compact ? 3 : 4}"></td></tr></tfoot>
  </table>`;
}

const PRESETS = {
  expense: { label: "経費（自分の財布/カードで支払）", debit: "消耗品費", credit: "事業主借" },
  expense_bank: { label: "経費（事業用口座から支払）", debit: "消耗品費", credit: "普通預金" },
  sale: { label: "売上（請求・掛け）", debit: "売掛金", credit: "売上高" },
  sale_cash: { label: "売上（即入金）", debit: "普通預金", credit: "売上高" },
  deposit: { label: "売掛金の入金", debit: "普通預金", credit: "売掛金" },
  owner_in: { label: "事業用口座へ入金（生活費→事業）", debit: "普通預金", credit: "事業主借" },
  owner_out: { label: "事業用口座から引き出し（生活費）", debit: "事業主貸", credit: "普通預金" },
};

export function openEntryForm({ entry = null, preset = null, defaults = {} }, onSaved) {
  const settings = state.meta?.settings || {};
  const p = PRESETS[preset] || null;
  const e = entry || {
    date: today(),
    debit_account: p?.debit || defaults.debit_account || "消耗品費",
    credit_account: p?.credit || defaults.credit_account || settings.default_credit_account || "事業主借",
    debit_amount: defaults.amount || "",
    debit_partner: defaults.partner || "",
    debit_item: defaults.item || "",
    description: defaults.description || "",
    debit_note: "",
    evidence: defaults.evidence || [],
    ...defaults,
  };
  if (!entry) {
    e.debit_tax_category = defaults.tax_category || defaultTaxFor(e.debit_account);
    e.credit_tax_category = defaultTaxFor(e.credit_account);
  }
  const partner = e.debit_partner || e.credit_partner || "";
  const body = `
    <form id="entry-form">
      ${entry ? "" : `<div class="row" style="margin-bottom:12px"><span class="muted small">よく使うパターン:</span>
        <select id="preset-select"><option value="">選択…</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${k === preset ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></div>`}
      <div class="form-grid">
        <label>取引日 <input type="date" name="date" value="${esc(e.date)}" required></label>
        <label>金額（税込） <input type="number" name="debit_amount" min="0" step="1" value="${esc(e.debit_amount)}" required></label>
        <label>借方（何に使ったか / 何が増えたか） <select name="debit_account">${accountOptions(e.debit_account)}</select></label>
        <label>借方 税区分 <select name="debit_tax_category">${taxOptions(e.debit_tax_category)}</select></label>
        <label>貸方（どこから払ったか / 何が減ったか） <select name="credit_account">${accountOptions(e.credit_account)}</select></label>
        <label>貸方 税区分 <select name="credit_tax_category">${taxOptions(e.credit_tax_category)}</select></label>
        <label>取引先 <input type="text" name="partner" list="partner-list" value="${esc(partner)}" placeholder="店名・会社名">${partnerDatalist()}</label>
        <label>品目 <input type="text" name="debit_item" value="${esc(e.debit_item)}" placeholder="例: 名刺、エアコン"></label>
        <label class="full">取引内容（摘要） <input type="text" name="description" value="${esc(e.description)}" placeholder="例: ○○社との打合せ（2名）"></label>
        <label class="full">備考 <input type="text" name="debit_note" value="${esc(e.debit_note)}"></label>
        <div class="full field"><span>証跡</span><div class="row" id="ev-list">${(e.evidence || []).map((v) => `<span class="chip" data-evid="${v.id}">${esc(v.original_name)} <button type="button" class="btn ghost small" data-unlink="${v.id}">✕</button></span>`).join("")}</div>
          <div class="row"><input type="file" id="ev-file" accept="image/*,.pdf" multiple><span class="form-hint">画像またはPDFを添付できます（複数可）</span></div>
        </div>
      </div>
    </form>`;
  const m = openModal({
    title: entry ? `仕訳を編集 #${entry.id}` : "仕訳を追加",
    body,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="entry-save">${entry ? "更新" : "登録"}</button>`,
  });
  const form = m.body.querySelector("#entry-form");
  const evidenceIds = new Set((e.evidence || []).map((v) => v.id));
  const pendingFiles = [];

  const debitSel = form.querySelector("[name=debit_account]");
  const creditSel = form.querySelector("[name=credit_account]");
  debitSel.addEventListener("change", () => { form.querySelector("[name=debit_tax_category]").value = defaultTaxFor(debitSel.value); });
  creditSel.addEventListener("change", () => { form.querySelector("[name=credit_tax_category]").value = defaultTaxFor(creditSel.value); });
  const presetSel = form.querySelector("#preset-select");
  presetSel && presetSel.addEventListener("change", () => {
    const pr = PRESETS[presetSel.value];
    if (!pr) return;
    debitSel.value = pr.debit; creditSel.value = pr.credit;
    debitSel.dispatchEvent(new Event("change")); creditSel.dispatchEvent(new Event("change"));
  });
  form.querySelector("#ev-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-unlink]");
    if (!b) return;
    evidenceIds.delete(Number(b.dataset.unlink));
    b.closest(".chip").remove();
  });
  form.querySelector("#ev-file").addEventListener("change", (ev) => {
    for (const f of ev.target.files) pendingFiles.push(f);
    const list = form.querySelector("#ev-list");
    for (const f of ev.target.files) list.insertAdjacentHTML("beforeend", `<span class="chip">${esc(f.name)} <span class="muted">(保存時にアップロード)</span></span>`);
  });

  m.el.querySelector("#entry-save").addEventListener("click", async () => {
    const v = formValues(form);
    if (!v.date || v.debit_amount === null) { setError(m.body, "取引日と金額は必須です"); return; }
    const btn = m.el.querySelector("#entry-save");
    btn.disabled = true;
    try {
      for (const f of pendingFiles) {
        const r = await api.upload("/api/evidence", f, { kind: accountCategory(v.debit_account) === "revenue" || accountCategory(v.credit_account) === "revenue" ? "invoice_issued" : "receipt", doc_date: v.date, vendor: v.partner, run_ocr_now: "false" });
        evidenceIds.add(r.evidence.id);
      }
      const payload = {
        date: v.date,
        debit_account: v.debit_account,
        debit_amount: v.debit_amount,
        debit_tax_category: v.debit_tax_category,
        debit_partner: v.partner,
        debit_item: v.debit_item,
        debit_note: v.debit_note,
        credit_account: v.credit_account,
        credit_tax_category: v.credit_tax_category,
        credit_partner: v.partner,
        description: v.description,
        source: entry ? entry.source : (evidenceIds.size ? "manual" : "manual"),
        evidence_ids: [...evidenceIds],
      };
      if (entry) await api.put(`/api/entries/${entry.id}`, payload);
      else await api.post("/api/entries", payload);
      toast(entry ? "仕訳を更新しました" : "仕訳を登録しました", "ok");
      m.close();
      await loadMeta();
      onSaved && onSaved();
    } catch (err) {
      setError(m.body, err.message);
    } finally {
      btn.disabled = false;
    }
  });
}
