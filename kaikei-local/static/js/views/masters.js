import { api } from "../api.js";
import { state, esc, toast, openModal, confirmDialog, setError, formValues, taxOptions } from "../ui.js";
import { loadMeta } from "../app.js";

let tab = "accounts";

export async function renderMasters(main) {
  main.innerHTML = `
    <div class="page-head"><h1>勘定科目・取引先</h1><div class="actions"><button class="btn primary" id="btn-add">＋ 追加</button></div></div>
    <div class="panel">
      <div class="tabs"><button data-tab="accounts" class="${tab === "accounts" ? "active" : ""}">勘定科目</button><button data-tab="partners" class="${tab === "partners" ? "active" : ""}">取引先</button></div>
      <div id="master-body"></div>
    </div>`;
  main.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; renderMasters(main); }));
  main.querySelector("#btn-add").addEventListener("click", () => (tab === "accounts" ? openAccountForm(null, () => renderMasters(main)) : openPartnerForm(null, () => renderMasters(main))));
  await loadMeta();
  const body = main.querySelector("#master-body");
  if (tab === "accounts") {
    const labels = state.meta.category_labels;
    body.innerHTML = `<p class="small muted">freee の仕訳帳CSVに出力する「決算書表示名」「ショートカット１」「勘定科目コード」をここで管理します。コードは freee の設定に合わせて入力してください（空欄でも取り込めます）。</p>
      <div class="table-wrap"><table class="data">
      <thead><tr><th>科目名</th><th>区分</th><th>決算書表示名</th><th>ショートカット１</th><th>コード</th><th>既定の税区分</th><th>状態</th><th></th></tr></thead>
      <tbody>${state.meta.accounts.map((a) => `<tr class="${a.is_active ? "" : "muted"}">
        <td><strong>${esc(a.name)}</strong></td><td>${esc(labels[a.category])}</td><td>${esc(a.display_name)}</td><td class="mono">${esc(a.shortcut1)}</td><td class="mono">${esc(a.code)}</td><td>${esc(a.default_tax_category)}</td>
        <td>${a.is_active ? `<span class="badge green">有効</span>` : `<span class="badge gray">無効</span>`}</td>
        <td class="nowrap"><button class="btn small" data-edit="${a.id}">編集</button> <button class="btn small danger" data-del="${a.id}">削除</button></td></tr>`).join("")}</tbody></table></div>`;
    body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openAccountForm(state.meta.accounts.find((a) => a.id === Number(b.dataset.edit)), () => renderMasters(main))));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("この勘定科目を削除しますか？"))) return;
      try { await api.del(`/api/accounts/${b.dataset.del}`); toast("削除しました", "ok"); renderMasters(main); } catch (err) { toast(err.message, "error"); }
    }));
  } else {
    const kinds = { customer: "得意先", vendor: "仕入先・支払先", both: "両方" };
    body.innerHTML = state.meta.partners.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>名称</th><th>区分</th><th>コード</th><th>登録番号</th><th>住所</th><th>メール</th><th>メモ</th><th></th></tr></thead>
      <tbody>${state.meta.partners.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(kinds[p.kind] || p.kind)}</td><td class="mono">${esc(p.code)}</td><td class="mono">${esc(p.registration_number)}</td><td>${esc(p.address)}</td><td>${esc(p.email)}</td><td>${esc(p.memo)}</td>
        <td class="nowrap"><button class="btn small" data-edit="${p.id}">編集</button> <button class="btn small danger" data-del="${p.id}">削除</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">取引先はまだありません。仕訳や請求書で入力すると自動で追加されます。</div>`;
    body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openPartnerForm(state.meta.partners.find((p) => p.id === Number(b.dataset.edit)), () => renderMasters(main))));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmDialog("この取引先を削除しますか？（仕訳の取引先名はそのまま残ります）"))) return;
      await api.del(`/api/partners/${b.dataset.del}`); toast("削除しました", "ok"); renderMasters(main);
    }));
  }
}

function openAccountForm(a, onSaved) {
  const labels = state.meta.category_labels;
  const d = a || { name: "", display_name: "", shortcut1: "", code: "", category: "expense", default_tax_category: "課対仕入10%", is_active: true, sort_order: (Math.max(0, ...state.meta.accounts.map((x) => x.sort_order)) + 10) };
  const m = openModal({
    title: a ? "勘定科目を編集" : "勘定科目を追加",
    body: `<form id="acc-form" class="form-grid">
      <label>科目名 <input type="text" name="name" value="${esc(d.name)}" required></label>
      <label>区分 <select name="category">${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${d.category === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      <label>決算書表示名 <input type="text" name="display_name" value="${esc(d.display_name)}" placeholder="空欄なら科目名と同じ"></label>
      <label>既定の税区分 <select name="default_tax_category">${taxOptions(d.default_tax_category)}</select></label>
      <label>ショートカット１（ローマ字） <input type="text" name="shortcut1" value="${esc(d.shortcut1)}" placeholder="例: SHOUMOU"></label>
      <label>勘定科目コード（ショートカット２） <input type="text" name="code" value="${esc(d.code)}" placeholder="例: 710"></label>
      <label>並び順 <input type="number" name="sort_order" value="${esc(d.sort_order)}"></label>
      <label class="row"><span><input type="checkbox" name="is_active" ${d.is_active ? "checked" : ""}> 有効（選択肢に表示する）</span></label>
    </form>`,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="acc-save">保存</button>`,
  });
  m.el.querySelector("#acc-save").addEventListener("click", async () => {
    const v = formValues(m.body.querySelector("#acc-form"));
    try {
      if (a) await api.put(`/api/accounts/${a.id}`, v); else await api.post("/api/accounts", v);
      toast("保存しました", "ok"); m.close(); onSaved();
    } catch (err) { setError(m.body, err.message); }
  });
}

function openPartnerForm(p, onSaved) {
  const d = p || { name: "", code: "", kind: "both", registration_number: "", address: "", email: "", memo: "" };
  const m = openModal({
    title: p ? "取引先を編集" : "取引先を追加",
    body: `<form id="pt-form" class="form-grid">
      <label>名称 <input type="text" name="name" value="${esc(d.name)}" required></label>
      <label>区分 <select name="kind"><option value="both" ${d.kind === "both" ? "selected" : ""}>両方</option><option value="customer" ${d.kind === "customer" ? "selected" : ""}>得意先</option><option value="vendor" ${d.kind === "vendor" ? "selected" : ""}>仕入先・支払先</option></select></label>
      <label>取引先コード <input type="text" name="code" value="${esc(d.code)}"></label>
      <label>適格請求書 登録番号 <input type="text" name="registration_number" value="${esc(d.registration_number)}" placeholder="T1234567890123"></label>
      <label class="full">住所 <input type="text" name="address" value="${esc(d.address)}"></label>
      <label>メール <input type="email" name="email" value="${esc(d.email)}"></label>
      <label>メモ <input type="text" name="memo" value="${esc(d.memo)}"></label>
    </form>`,
    footer: `<button class="btn" data-close>キャンセル</button><button class="btn primary" id="pt-save">保存</button>`,
  });
  m.el.querySelector("#pt-save").addEventListener("click", async () => {
    const v = formValues(m.body.querySelector("#pt-form"));
    try {
      if (p) await api.put(`/api/partners/${p.id}`, v); else await api.post("/api/partners", v);
      toast("保存しました", "ok"); m.close(); onSaved();
    } catch (err) { setError(m.body, err.message); }
  });
}
