import { api } from "../api.js";
import { state, esc, toast, setError, formValues, accountOptions } from "../ui.js";
import { loadMeta } from "../app.js";

export async function renderSettings(main) {
  const [s, sys] = await Promise.all([api.get("/api/settings"), api.get("/api/system")]);
  main.innerHTML = `
    <div class="page-head"><h1>設定</h1><div class="actions"><button class="btn primary" id="set-save">保存</button></div></div>
    <form id="set-form">
    <div class="grid cols-2">
      <div class="panel">
        <h2>事業者情報（請求書・CSVに使用）</h2>
        <div class="form-grid">
          <label>屋号 <input type="text" name="business_name" value="${esc(s.business_name)}"></label>
          <label>氏名 <input type="text" name="owner_name" value="${esc(s.owner_name)}"></label>
          <label>メールアドレス <input type="email" name="owner_email" value="${esc(s.owner_email)}"><span class="form-hint">freee CSV の「作成者」列に出力されます</span></label>
          <label>適格請求書発行事業者 登録番号 <input type="text" name="invoice_registration_number" value="${esc(s.invoice_registration_number)}" placeholder="T1234567890123（未登録なら空欄）"></label>
          <label class="full">住所 <textarea name="address">${esc(s.address)}</textarea></label>
          <label class="full">振込先（請求書に印字） <textarea name="bank_info" placeholder="○○銀行 ○○支店 普通 1234567 名義">${esc(s.bank_info)}</textarea></label>
        </div>
      </div>
      <div class="panel">
        <h2>会計設定</h2>
        <div class="form-grid">
          <label>会計年度（既定） <input type="number" name="fiscal_year" value="${esc(s.fiscal_year)}"></label>
          <label>消費税経理処理 <select name="tax_method"><option ${s.tax_method === "税込経理" ? "selected" : ""}>税込経理</option><option ${s.tax_method === "税抜経理" ? "selected" : ""}>税抜経理</option></select><span class="form-hint">免税事業者・簡易課税なら通常「税込経理」</span></label>
          <label>経費の既定の貸方（支払元） <select name="default_credit_account">${accountOptions(s.default_credit_account, { categories: ["asset", "liability", "equity"] })}</select><span class="form-hint">個人の財布・カードで払うことが多ければ「事業主借」</span></label>
          <label>売上の既定の借方 <select name="default_debit_account_for_sales">${accountOptions(s.default_debit_account_for_sales, { categories: ["asset"] })}</select></label>
          <label>入金先の既定口座 <select name="default_deposit_account">${accountOptions(s.default_deposit_account, { categories: ["asset"] })}</select></label>
          <label>請求書番号の接頭辞 <input type="text" name="invoice_prefix" value="${esc(s.invoice_prefix)}"></label>
          <label class="full">請求書の既定の備考 <textarea name="invoice_note">${esc(s.invoice_note)}</textarea></label>
        </div>
      </div>
      <div class="panel">
        <h2>OCR / AI 仕訳提案</h2>
        <div class="form-grid">
          <label>OCR プロバイダ <select name="ocr_provider">
            <option value="claude" ${s.ocr_provider === "claude" ? "selected" : ""}>Claude API（推奨・画像/PDF対応・科目まで提案）</option>
            <option value="tesseract" ${s.ocr_provider === "tesseract" ? "selected" : ""}>Tesseract（ローカル・画像のみ・精度は低め）${sys.tesseract_available ? "" : " — 未インストール"}</option>
            <option value="none" ${s.ocr_provider === "none" ? "selected" : ""}>使わない（手入力）</option>
          </select></label>
          <label>Claude モデル <input type="text" name="claude_model" value="${esc(s.claude_model)}"><span class="form-hint">既定 claude-opus-5。読み取り精度を優先するなら既定のまま</span></label>
          <label class="full">Anthropic API キー <input type="password" name="anthropic_api_key" value="${esc(s.anthropic_api_key)}" placeholder="sk-ant-..." autocomplete="off">
            <span class="form-hint">このPCの <span class="mono">data/settings.json</span> にのみ保存されます（環境変数 ANTHROPIC_API_KEY でも可${sys.anthropic_env_key ? "・現在環境変数が設定されています" : ""}）。状態: ${s.anthropic_api_key_configured ? "<span class='badge green'>設定済み</span>" : "<span class='badge amber'>未設定</span>"}</span></label>
          <label class="row"><span><input type="checkbox" name="auto_ocr_on_upload" ${s.auto_ocr_on_upload ? "checked" : ""}> アップロード時に自動で OCR を実行する</span></label>
          <label class="row"><span><input type="checkbox" name="refusal_fallback" ${s.refusal_fallback ? "checked" : ""}> 安全分類器で拒否された場合に別モデルへ自動フォールバックする</span></label>
        </div>
        <p class="form-hint">領収書の画像は Anthropic の API に送信されます。送信したくない書類は OCR を実行せず手入力してください。</p>
      </div>
      <div class="panel">
        <h2>システム情報</h2>
        <dl class="kv">
          <dt>データ保存先</dt><dd class="mono">${esc(sys.data_dir)}</dd>
          <dt>DB</dt><dd class="mono">${esc(sys.db_path)}</dd>
          <dt>Python</dt><dd>${esc(sys.python)}</dd>
          <dt>OS</dt><dd>${esc(sys.platform)}</dd>
          <dt>Tesseract</dt><dd>${sys.tesseract_available ? "利用可能" : "未インストール"}</dd>
        </dl>
        <p class="form-hint">保存先を変えるには環境変数 <span class="mono">KAIKEI_DATA_DIR</span> を設定して起動してください。</p>
      </div>
    </div>
    </form>`;
  main.querySelector("#set-save").addEventListener("click", async () => {
    const v = formValues(main.querySelector("#set-form"));
    try {
      await api.put("/api/settings", v);
      toast("設定を保存しました", "ok");
      await loadMeta();
      renderSettings(main);
    } catch (err) { setError(main.querySelector("#set-form"), err.message); }
  });
}
