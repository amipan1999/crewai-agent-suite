import { api } from "../api.js";
import { state, esc, toast, setError } from "../ui.js";
import { loadMeta } from "../app.js";

export async function renderData(main) {
  const y = state.year;
  main.innerHTML = `
    <div class="page-head"><h1>CSV出力・取込・バックアップ</h1></div>
    <div class="grid cols-2">
      <div class="panel">
        <h2>仕訳帳CSV（freee 形式・確定申告用）</h2>
        <p class="small muted">freee の「仕訳帳エクスポート」と同じ 97 列のレイアウトで出力します。freee へのインポートや、税理士への提出、確定申告ソフトへの取込にそのまま使えます。</p>
        <div class="toolbar">
          <label>対象年<select id="exp-year">${yearOptions(y)}</select></label>
          <label>開始日（任意）<input type="date" id="exp-from"></label>
          <label>終了日（任意）<input type="date" id="exp-to"></label>
        </div>
        <label class="row small"><input type="checkbox" id="exp-bom"> Excel で開く用に BOM を付ける（freee へ取り込む場合はオフ）</label>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="exp-go">仕訳帳CSVをダウンロード</button></div>
      </div>
      <div class="panel">
        <h2>証跡の索引簿CSV（電子帳簿保存法向け）</h2>
        <p class="small muted">証跡ファイルごとの「取引日・金額・取引先・ファイル名・保存パス・ハッシュ値」を一覧にします。日付・金額・取引先で検索できる状態を保つための一覧です。</p>
        <div class="row"><a class="btn" href="/api/export/evidence-index?year=${y}">${y}年の索引簿をダウンロード</a><a class="btn" href="/api/export/evidence-index">全期間</a></div>
      </div>
      <div class="panel">
        <h2>freee 仕訳帳CSVの取り込み</h2>
        <p class="small muted">freee からエクスポートした仕訳帳CSV（UTF-8 / Shift_JIS）を読み込みます。同じ取引ID・仕訳IDの行はスキップされるので、何度取り込んでも重複しません。未知の勘定科目は自動でマスタに追加されます。</p>
        <div class="row"><input type="file" id="imp-file" accept=".csv,text/csv"><button class="btn primary" id="imp-go">取り込む</button></div>
        <div id="imp-result" style="margin-top:10px"></div>
      </div>
      <div class="panel">
        <h2>バックアップ</h2>
        <p class="small muted">データベース・すべての証跡ファイル・設定を 1 つの ZIP にまとめます。定期的に外部ドライブやクラウドへ保存してください。復元するときは ZIP の中身を <span class="mono">${esc(state.meta?.data_dir || "data/")}</span> に展開します。</p>
        <div class="row"><a class="btn primary" href="/api/backup">バックアップZIPをダウンロード</a></div>
        <p class="form-hint">保存先フォルダ: <span class="mono">${esc(state.meta?.data_dir || "")}</span></p>
      </div>
    </div>`;
  main.querySelector("#exp-go").addEventListener("click", () => {
    const params = { year: main.querySelector("#exp-year").value, date_from: main.querySelector("#exp-from").value, date_to: main.querySelector("#exp-to").value, bom: main.querySelector("#exp-bom").checked ? "true" : "" };
    if (params.date_from || params.date_to) delete params.year;
    location.href = api.downloadUrl("/api/export/freee", params);
  });
  main.querySelector("#imp-go").addEventListener("click", async () => {
    const f = main.querySelector("#imp-file").files[0];
    const box = main.querySelector("#imp-result");
    if (!f) { box.innerHTML = `<div class="error-box">CSVファイルを選択してください</div>`; return; }
    box.innerHTML = `<div class="muted small">取り込み中…</div>`;
    try {
      const r = await api.upload("/api/import/freee", f);
      box.innerHTML = `<div class="info-box">読み込み ${r.rows} 行 → 取込 ${r.imported} 件 / スキップ ${r.skipped} 件${r.errors.length ? ` / エラー ${r.errors.length} 件` : ""}</div>
        ${r.errors.length ? `<pre class="raw">${r.errors.map(esc).join("\n")}</pre>` : ""}`;
      toast(`${r.imported} 件を取り込みました`, "ok");
      await loadMeta();
    } catch (err) {
      box.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  });
}

function yearOptions(selected) {
  const years = new Set((state.meta?.years || []).map(Number));
  years.add(selected); years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a).map((y) => `<option value="${y}" ${y === selected ? "selected" : ""}>${y}年</option>`).join("");
}
