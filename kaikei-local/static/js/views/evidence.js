import { api } from "../api.js";
import { state, esc, yen, toast, openModal, confirmDialog, setError, accountOptions, taxOptions, partnerDatalist, defaultTaxFor, monthOptions, kindBadge, ocrBadge, today } from "../ui.js";
import { openEntryForm } from "./journal.js";
import { loadMeta } from "../app.js";

const filters = { kind: "", month: "", linked: "", q: "", amount_min: "", amount_max: "" };

function ocrReady() {
  const s = state.meta?.settings || {};
  if (s.ocr_provider === "none") return false;
  if (s.ocr_provider === "claude") return !!s.anthropic_api_key_configured;
  return true;
}

export async function renderEvidence(main, route) {
  if (route?.query?.has("linked")) filters.linked = route.query.get("linked");
  const kinds = state.meta?.evidence_kinds || {};
  main.innerHTML = `
    <div class="page-head">
      <h1>証跡 <span class="muted small">${state.year}年 — 領収書・請求書・明細をすべてここで管理</span></h1>
      <div class="actions"><button class="btn primary" id="btn-upload">＋ アップロード</button></div>
    </div>
    <div class="dropzone" id="dropzone">
      ここに領収書・レシート・請求書（画像 / PDF）をドラッグ＆ドロップ、またはクリックして選択<br>
      <span class="small">${ocrReady() && state.meta?.settings?.auto_ocr_on_upload ? "アップロード後、自動でOCR（AI読み取り）して仕訳候補を作ります" : ocrReady() ? "OCR は証跡の詳細画面から実行できます（設定で自動実行にもできます）" : "OCR（AI読み取り）を使うには設定画面で Claude API キーを登録してください"}</span>
      <input type="file" id="drop-input" accept="image/*,.pdf" multiple>
      <div class="upload-progress" id="upload-progress"></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="toolbar">
        <label>種別<select id="f-kind"><option value="">すべて</option>${Object.entries(kinds).map(([k, v]) => `<option value="${k}" ${filters.kind === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label>月<select id="f-month">${monthOptions(filters.month)}</select></label>
        <label>仕訳との紐づけ<select id="f-linked"><option value="">すべて</option><option value="false" ${filters.linked === "false" ? "selected" : ""}>未紐づけ</option><option value="true" ${filters.linked === "true" ? "selected" : ""}>紐づけ済み</option></select></label>
        <label>金額（下限）<input type="number" id="f-amin" value="${esc(filters.amount_min)}" style="width:110px"></label>
        <label>金額（上限）<input type="number" id="f-amax" value="${esc(filters.amount_max)}" style="width:110px"></label>
        <label>検索<input type="text" id="f-q" placeholder="取引先・ファイル名・OCRテキスト" value="${esc(filters.q)}"></label>
        <span class="spacer"></span><span class="muted small" id="ev-count"></span>
      </div>
      <div id="gallery" class="gallery"></div>
    </div>`;

  const reload = () => loadGallery(main);
  main.querySelector("#btn-upload").addEventListener("click", () => openUploadDialog(reload));
  const dz = main.querySelector("#dropzone");
  const input = main.querySelector("#drop-input");
  dz.addEventListener("click", (e) => { if (e.target.tagName !== "INPUT") input.click(); });
  input.addEventListener("change", () => { uploadFiles([...input.files], main.querySelector("#upload-progress"), reload); input.value = ""; });
  ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => uploadFiles([...e.dataTransfer.files], main.querySelector("#upload-progress"), reload));

  const bind = (id, key, ev = "change") => main.querySelector(id).addEventListener(ev, (e) => { filters[key] = e.target.value; reload(); });
  bind("#f-kind", "kind"); bind("#f-month", "month"); bind("#f-linked", "linked");
  let t;
  ["#f-q", "#f-amin", "#f-amax"].forEach((id) => main.querySelector(id).addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { filters[{ "#f-q": "q", "#f-amin": "amount_min", "#f-amax": "amount_max" }[id]] = e.target.value; reload(); }, 300);
  }));
  await reload();
}

async function loadGallery(main) {
  const g = main.querySelector("#gallery");
  if (!g) return;
  const data = await api.get("/api/evidence", { year: state.year, kind: filters.kind, month: filters.month, linked: filters.linked, q: filters.q, amount_min: filters.amount_min, amount_max: filters.amount_max, limit: 1000 });
  main.querySelector("#ev-count").textContent = `${data.total} 件`;
  if (!data.items.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1">該当する証跡がありません</div>`; return; }
  g.innerHTML = data.items.map(cardHtml).join("");
  g.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => openEvidenceDetail(Number(c.dataset.id), () => loadGallery(main))));
}

function cardHtml(ev) {
  const thumb = ev.mime.startsWith("image/")
    ? `<img src="/api/evidence/${ev.id}/thumbnail?size=400&v=${encodeURIComponent(ev.updated_at)}" alt="" loading="lazy">`
    : `<div class="pdf">PDF</div>`;
  return `<div class="card" data-id="${ev.id}">
    <div class="thumb">${thumb}</div>
    <div class="body">
      <div class="vendor" title="${esc(ev.vendor || ev.original_name)}">${esc(ev.vendor || ev.original_name)}</div>
      <div class="row" style="justify-content:space-between"><span class="muted">${esc(ev.doc_date || "日付未設定")}</span><span class="amount">${ev.amount != null ? yen(ev.amount) : ""}</span></div>
      <div class="tags">${kindBadge(ev.kind)} ${ocrBadge(ev)} ${ev.linked ? `<span class="badge green">仕訳済</span>` : `<span class="badge amber">未仕訳</span>`}</div>
    </div>
  </div>`;
}

export function openUploadDialog(onDone) {
  const kinds = state.meta?.evidence_kinds || {};
  const m = openModal({
    title: "証跡をアップロード",
    body: `<form id="up-form" class="form-grid">
      <label class="full">ファイル（複数可） <input type="file" name="files" accept="image/*,.pdf" multiple required></label>
      <label>種別 <select name="kind">${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label>取引日（任意） <input type="date" name="doc_date"></label>
      <label>取引先（任意） <input type="text" name="vendor" list="partner-list">${partnerDatalist()}</label>
      <label>メモ（任意） <input type="text" name="memo"></label>
      <label class="full row"><span><input type="checkbox" name="run_ocr" ${ocrReady() ? "checked" : "disabled"}> アップロード後にOCR（AI読み取り）を実行する${ocrReady() ? "" : "（設定で API キーを登録すると使えます）"}</span></label>
      <div class="full upload-progress" id="up-progress"></div>
    </form>`,
    footer: `<button class="btn" data-close>閉じる</button><button class="btn primary" id="up-go">アップロード</button>`,
  });
  m.el.querySelector("#up-go").addEventListener("click", async () => {
    const form = m.body.querySelector("#up-form");
    const files = [...form.files.files];
    if (!files.length) { setError(m.body, "ファイルを選択してください"); return; }
    const fields = { kind: form.kind.value, doc_date: form.doc_date.value, vendor: form.vendor.value, memo: form.memo.value, run_ocr_now: form.run_ocr.checked ? "true" : "false" };
    m.el.querySelector("#up-go").disabled = true;
    await uploadFiles(files, m.body.querySelector("#up-progress"), null, fields);
    m.close();
    onDone && onDone();
  });
}

export async function uploadFiles(files, progressEl, onDone, fields = {}) {
  let ok = 0, dup = 0, fail = 0, ocrFail = 0;
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (progressEl) progressEl.textContent = `アップロード中 ${i + 1}/${files.length}: ${f.name}${ocrReady() ? "（OCR中は数十秒かかることがあります）" : ""}`;
    try {
      const r = await api.upload("/api/evidence", f, fields);
      if (r.duplicate) dup++; else ok++;
      if (r.ocr_error) ocrFail++;
      results.push(r);
    } catch (err) {
      fail++;
      toast(`${f.name}: ${err.message}`, "error");
    }
  }
  if (progressEl) progressEl.textContent = "";
  const parts = [`${ok} 件を保存`];
  if (dup) parts.push(`${dup} 件は登録済み（同一ファイル）`);
  if (fail) parts.push(`${fail} 件失敗`);
  if (ocrFail) parts.push(`${ocrFail} 件は OCR に失敗（詳細画面で再実行できます）`);
  toast(parts.join(" / "), fail ? "error" : "ok");
  onDone && onDone();
  if (results.length === 1 && !results[0].duplicate && files.length === 1) {
    openEvidenceDetail(results[0].evidence.id, onDone);
  }
  return results;
}

export async function openEvidenceDetail(id, onChange) {
  let ev = await api.get(`/api/evidence/${id}`);
  const m = openModal({ title: `証跡 #${ev.id}`, body: "", wide: true, footer: `<button class="btn danger" id="ev-delete">削除</button><span style="flex:1"></span><a class="btn" id="ev-download" href="/api/evidence/${ev.id}/file?download=true">ダウンロード</a><button class="btn" data-close>閉じる</button>` });
  const rerender = async () => {
    ev = await api.get(`/api/evidence/${id}`);
    m.body.innerHTML = detailHtml(ev);
    wire();
  };
  m.el.querySelector("#ev-delete").addEventListener("click", async () => {
    if (!(await confirmDialog("この証跡ファイルを削除しますか？紐づいている仕訳は残ります。"))) return;
    await api.del(`/api/evidence/${id}`);
    toast("証跡を削除しました", "ok");
    m.close();
    onChange && onChange();
  });

  function wire() {
    const body = m.body;
    // メタ情報の保存
    body.querySelector("#meta-save").addEventListener("click", async () => {
      const f = body.querySelector("#meta-form");
      try {
        await api.patch(`/api/evidence/${id}`, { kind: f.kind.value, doc_date: f.doc_date.value, vendor: f.vendor.value, amount: f.amount.value === "" ? null : Number(f.amount.value), memo: f.memo.value });
        toast("保存しました", "ok");
        await rerender();
        onChange && onChange();
      } catch (err) { setError(body, err.message); }
    });
    // OCR
    const ocrBtn = body.querySelector("#ocr-run");
    ocrBtn && ocrBtn.addEventListener("click", async () => {
      ocrBtn.disabled = true;
      ocrBtn.textContent = "読み取り中…（数十秒かかることがあります）";
      try {
        await api.post(`/api/evidence/${id}/ocr`);
        toast("OCR が完了しました。内容を確認して仕訳を作成してください。", "ok");
        await rerender();
        onChange && onChange();
      } catch (err) {
        setError(body, "OCR に失敗しました: " + err.message);
        ocrBtn.disabled = false;
        ocrBtn.textContent = "OCR を再実行";
      }
    });
    // 仕訳作成
    const applyForm = body.querySelector("#apply-form");
    if (applyForm) {
      const debit = applyForm.querySelector("[name=debit_account]");
      debit.addEventListener("change", () => { applyForm.querySelector("[name=tax_category]").value = defaultTaxFor(debit.value); });
      body.querySelector("#apply-go").addEventListener("click", async () => {
        const payload = {
          date: applyForm.date.value, amount: Number(applyForm.amount.value || 0), debit_account: applyForm.debit_account.value,
          credit_account: applyForm.credit_account.value, tax_category: applyForm.tax_category.value, partner: applyForm.partner.value,
          item: applyForm.item.value, description: applyForm.description.value,
        };
        try {
          const r = await api.post(`/api/evidence/${id}/apply`, payload);
          toast(`仕訳 #${r.entry.id} を作成しました`, "ok");
          await loadMeta();
          await rerender();
          onChange && onChange();
        } catch (err) { setError(body, err.message); }
      });
      body.querySelector("#apply-detail").addEventListener("click", () => {
        openEntryForm({ defaults: {
          date: applyForm.date.value, amount: Number(applyForm.amount.value || 0), debit_account: applyForm.debit_account.value,
          credit_account: applyForm.credit_account.value, tax_category: applyForm.tax_category.value, partner: applyForm.partner.value,
          item: applyForm.item.value, description: applyForm.description.value, evidence: [{ id: ev.id, original_name: ev.original_name }],
        } }, async () => { await rerender(); onChange && onChange(); });
      });
    }
    body.querySelectorAll("[data-edit-entry]").forEach((b) => b.addEventListener("click", async () => {
      const entry = await api.get(`/api/entries/${b.dataset.editEntry}`);
      openEntryForm({ entry }, async () => { await rerender(); onChange && onChange(); });
    }));
  }
  m.body.innerHTML = detailHtml(ev);
  wire();
}

function detailHtml(ev) {
  const settings = state.meta?.settings || {};
  const kinds = state.meta?.evidence_kinds || {};
  const ocr = ev.ocr;
  const preview = ev.mime.startsWith("image/")
    ? `<img src="/api/evidence/${ev.id}/file?v=${encodeURIComponent(ev.updated_at)}" alt="${esc(ev.original_name)}">`
    : ev.mime === "application/pdf" ? `<iframe src="/api/evidence/${ev.id}/file#toolbar=1" title="PDF"></iframe>` : `<div class="muted">プレビューできない形式です</div>`;
  const isSale = (ocr?.doc_type || ev.kind) === "invoice_issued";
  const suggestedDebit = isSale ? (settings.default_debit_account_for_sales || "売掛金") : (ocr?.suggested_account || "消耗品費");
  const suggestedCredit = isSale ? "売上高" : (settings.default_credit_account || "事業主借");
  const suggestedTax = ocr?.suggested_tax_category || defaultTaxFor(isSale ? "売上高" : suggestedDebit);
  const ocrUnavailable = settings.ocr_provider === "none" || (settings.ocr_provider === "claude" && !settings.anthropic_api_key_configured);
  const ocrSection = `
    <div class="section">
      <h4>OCR / AI 読み取り ${ocrBadge(ev)}</h4>
      ${ev.ocr_status === "error" ? `<div class="error-box">${esc(ev.ocr_error)}</div>` : ""}
      ${ocr ? `
        <dl class="kv">
          <dt>書類</dt><dd>${esc(kinds[ocr.doc_type] || ocr.doc_type || "")}</dd>
          <dt>日付</dt><dd>${esc(ocr.date || "—")}</dd>
          <dt>発行者</dt><dd>${esc(ocr.vendor || "—")}${ocr.registration_number ? ` <span class="badge gray">${esc(ocr.registration_number)}</span>` : ""}</dd>
          <dt>合計</dt><dd>${ocr.total != null ? yen(ocr.total) : "—"}${ocr.tax != null ? ` <span class="muted">（内消費税 ${yen(ocr.tax)}）</span>` : ""}${ocr.has_reduced_rate ? ` <span class="badge amber">軽減税率あり</span>` : ""}</dd>
          <dt>支払方法</dt><dd>${esc(ocr.payment_method || "—")}</dd>
          <dt>科目候補</dt><dd><strong>${esc(ocr.suggested_account)}</strong> <span class="muted">/ ${esc(ocr.suggested_tax_category)}</span></dd>
          <dt>確度</dt><dd>${Math.round((ocr.confidence || 0) * 100)}% <span class="muted small">(${esc(ocr.provider)}${ocr.model ? " / " + esc(ocr.model) : ""})</span></dd>
        </dl>
        ${(ocr.warnings || []).length ? `<div class="warn-box" style="margin-top:8px">${ocr.warnings.map(esc).join("<br>")}</div>` : ""}
        ${(ocr.items || []).length ? `<details style="margin-top:6px"><summary>明細 ${ocr.items.length} 件</summary><table class="data small"><tbody>${ocr.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${yen(i.amount)}</td><td class="muted">${i.tax_rate}%</td></tr>`).join("")}</tbody></table></details>` : ""}
        ${ocr.raw_text ? `<details style="margin-top:6px"><summary>読み取ったテキスト</summary><pre class="raw">${esc(ocr.raw_text)}</pre></details>` : ""}
        <div style="margin-top:8px"><button class="btn small" id="ocr-run">OCR を再実行</button></div>
      ` : `<p class="muted small" style="margin:0 0 8px">${ocrUnavailable ? `OCR を使うには<a href="#/settings">設定画面</a>で Claude API キーを登録してください。登録すると画像・PDFから日付・金額・科目候補を自動で読み取れます。` : "まだ読み取っていません。"}</p>
        <button class="btn primary small" id="ocr-run" ${ocrUnavailable ? "disabled" : ""}>OCR を実行</button>`}
    </div>`;
  const applySection = ev.entries.length ? "" : `
    <div class="section">
      <h4>この証跡から仕訳を作成</h4>
      <form id="apply-form" class="form-grid">
        <label>取引日 <input type="date" name="date" value="${esc(ocr?.date || ev.doc_date || today())}"></label>
        <label>金額（税込） <input type="number" name="amount" value="${esc(ocr?.total ?? ev.amount ?? "")}"></label>
        <label>借方（科目） <select name="debit_account">${accountOptions(suggestedDebit)}</select></label>
        <label>税区分 <select name="tax_category">${taxOptions(suggestedTax)}</select></label>
        <label>貸方（支払元） <select name="credit_account">${accountOptions(suggestedCredit)}</select></label>
        <label>取引先 <input type="text" name="partner" list="partner-list" value="${esc(ocr?.vendor || ev.vendor || "")}">${partnerDatalist()}</label>
        <label>品目 <input type="text" name="item" value="${esc((ocr?.items || [])[0]?.name || "")}"></label>
        <label>取引内容 <input type="text" name="description" value="${esc(ocr?.description || "")}"></label>
      </form>
      <div class="row" style="margin-top:10px; justify-content:flex-end">
        <button class="btn" id="apply-detail">詳細フォームで編集…</button>
        <button class="btn primary" id="apply-go">この内容で仕訳を登録</button>
      </div>
    </div>`;
  const linked = `
    <div class="section">
      <h4>紐づく仕訳</h4>
      ${ev.entries.length ? `<table class="data"><tbody>${ev.entries.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.debit_account || "")} / ${esc(e.credit_account || "")}</td><td class="num">${yen(e.debit_amount)}</td><td>${esc(e.description)}</td><td><button class="btn small" data-edit-entry="${e.id}">開く</button></td></tr>`).join("")}</tbody></table>` : `<span class="muted small">まだ仕訳に紐づいていません</span>`}
      ${ev.invoice ? `<div class="small" style="margin-top:6px">請求書 <a href="#/invoices">${esc(ev.invoice.invoice_no)}</a> の控え</div>` : ""}
    </div>`;
  return `
    <div class="detail-grid">
      <div>
        <div class="preview">${preview}</div>
        <div class="muted small" style="margin-top:6px">${esc(ev.original_name)} · ${(ev.size / 1024).toFixed(0)} KB · 登録 ${esc(ev.created_at)}<br><span class="mono">SHA-256 ${esc(ev.sha256.slice(0, 16))}…</span> · 保存先 evidence/${esc(ev.stored_path)}</div>
      </div>
      <div>
        <div class="section">
          <h4>書類情報 <button class="btn small" id="meta-save">保存</button></h4>
          <form id="meta-form" class="form-grid">
            <label>種別 <select name="kind">${Object.entries(kinds).map(([k, v]) => `<option value="${k}" ${ev.kind === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
            <label>取引日 <input type="date" name="doc_date" value="${esc(ev.doc_date)}"></label>
            <label>取引先 <input type="text" name="vendor" value="${esc(ev.vendor)}" list="partner-list"></label>
            <label>金額 <input type="number" name="amount" value="${esc(ev.amount ?? "")}"></label>
            <label class="full">メモ <input type="text" name="memo" value="${esc(ev.memo)}"></label>
          </form>
        </div>
        ${ocrSection}
        ${applySection}
        ${linked}
      </div>
    </div>`;
}
