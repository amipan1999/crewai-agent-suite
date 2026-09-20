// 画面共通のユーティリティ
export const state = {
  meta: null,
  year: new Date().getFullYear(),
};

export function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function yen(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (Number.isNaN(v)) return String(n);
  return "¥" + v.toLocaleString("ja-JP");
}

export function num(n) {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("ja-JP");
}

export function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toast(message, kind = "") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 3200);
}

export function accountOptions(selected, { categories = null, includeEmpty = false } = {}) {
  const accounts = (state.meta?.accounts || []).filter((a) => a.is_active || a.name === selected);
  const labels = state.meta?.category_labels || {};
  const groups = {};
  for (const a of accounts) {
    if (categories && !categories.includes(a.category)) continue;
    (groups[a.category] ||= []).push(a);
  }
  let html = includeEmpty ? `<option value="">（なし）</option>` : "";
  for (const cat of ["expense", "revenue", "asset", "liability", "equity"]) {
    if (!groups[cat]) continue;
    html += `<optgroup label="${esc(labels[cat] || cat)}">`;
    for (const a of groups[cat]) {
      html += `<option value="${esc(a.name)}" ${a.name === selected ? "selected" : ""}>${esc(a.name)}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

export function taxOptions(selected) {
  return (state.meta?.tax_categories || [])
    .map((t) => `<option value="${esc(t.name)}" ${t.name === selected ? "selected" : ""}>${esc(t.name)}</option>`)
    .join("");
}

export function partnerDatalist(id = "partner-list") {
  const items = (state.meta?.partners || []).map((p) => `<option value="${esc(p.name)}"></option>`).join("");
  return `<datalist id="${id}">${items}</datalist>`;
}

export function defaultTaxFor(accountName) {
  const a = (state.meta?.accounts || []).find((x) => x.name === accountName);
  return a ? a.default_tax_category : "対象外";
}

export function accountCategory(accountName) {
  const a = (state.meta?.accounts || []).find((x) => x.name === accountName);
  return a ? a.category : null;
}

export function monthOptions(selected) {
  let html = `<option value="">全月</option>`;
  for (let m = 1; m <= 12; m++) html += `<option value="${m}" ${String(selected) === String(m) ? "selected" : ""}>${m}月</option>`;
  return html;
}

// ---- モーダル ----
export function openModal({ title, body, footer = "", wide = false, onClose = null }) {
  const root = document.getElementById("modal-root");
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost" data-close aria-label="閉じる">✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  root.appendChild(wrap);
  return { el: wrap, close, body: wrap.querySelector(".modal-body"), foot: wrap.querySelector(".modal-foot") };
}

export function confirmDialog(message, { okLabel = "削除する", danger = true } = {}) {
  return new Promise((resolve) => {
    const m = openModal({
      title: "確認",
      body: `<p style="margin:0">${esc(message)}</p>`,
      footer: `<button class="btn" data-close>キャンセル</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okLabel)}</button>`,
      onClose: () => resolve(false),
    });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { resolve(true); m.el.remove(); });
  });
}

export function formValues(form) {
  const out = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "number") out[el.name] = el.value === "" ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

export function setError(container, message) {
  let box = container.querySelector(".error-box");
  if (!message) { box && box.remove(); return; }
  if (!box) {
    box = document.createElement("div");
    box.className = "error-box";
    container.prepend(box);
  }
  box.textContent = message;
}

export function kindBadge(kind) {
  const label = state.meta?.evidence_kinds?.[kind] || kind;
  const color = { receipt: "blue", invoice_received: "amber", invoice_issued: "green", bank: "gray", contract: "gray", delivery_note: "gray", other: "gray" }[kind] || "gray";
  return `<span class="badge ${color}">${esc(label)}</span>`;
}

export function ocrBadge(ev) {
  if (ev.ocr_status === "done") return `<span class="badge green">OCR済</span>`;
  if (ev.ocr_status === "error") return `<span class="badge red" title="${esc(ev.ocr_error)}">OCR失敗</span>`;
  return `<span class="badge gray">未OCR</span>`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
