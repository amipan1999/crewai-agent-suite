import { api } from "../api.js";
import { state, esc, yen, num } from "../ui.js";
import { entriesTable, openEntryForm } from "./journal.js";
import { openUploadDialog } from "./evidence.js";

export async function renderDashboard(main) {
  const [summary, recent] = await Promise.all([
    api.get("/api/reports/summary", { year: state.year }),
    api.get("/api/entries", { year: state.year, limit: 8 }),
  ]);
  const maxMonth = Math.max(1, ...summary.months.map((m) => Math.max(m.revenue, m.expense)));
  const topExpenses = summary.accounts.filter((a) => a.category === "expense" && a.net > 0).sort((a, b) => b.net - a.net).slice(0, 8);
  const maxExp = Math.max(1, ...topExpenses.map((a) => a.net));
  main.innerHTML = `
    <div class="page-head">
      <h1>ダッシュボード <span class="muted small">${state.year}年</span></h1>
      <div class="actions">
        <button class="btn" id="dash-upload">領収書・請求書をアップロード</button>
        <button class="btn primary" id="dash-entry">＋ 仕訳を追加</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat"><div class="label">売上（収入）</div><div class="value">${yen(summary.revenue_total)}</div></div>
      <div class="stat"><div class="label">経費</div><div class="value">${yen(summary.expense_total)}</div></div>
      <div class="stat ${summary.profit >= 0 ? "ok" : "warn"}"><div class="label">差引金額（所得の目安）</div><div class="value">${yen(summary.profit)}</div><div class="sub">青色申告特別控除・各種控除前</div></div>
      <div class="stat"><div class="label">仕訳件数</div><div class="value">${num(summary.entry_count)}</div></div>
    </div>
    <div class="grid cols-2" style="margin-bottom:16px">
      <a class="stat ${summary.unlinked_evidence ? "warn" : ""}" href="#/evidence?linked=false"><div class="label">仕訳に紐づいていない証跡</div><div class="value">${num(summary.unlinked_evidence)} 件</div><div class="sub">クリックして確認</div></a>
      <a class="stat ${summary.unpaid_invoices.count ? "warn" : ""}" href="#/invoices"><div class="label">未入金の請求書</div><div class="value">${num(summary.unpaid_invoices.count)} 件 / ${yen(summary.unpaid_invoices.total)}</div><div class="sub">クリックして確認</div></a>
    </div>
    <div class="grid cols-2">
      <div class="panel">
        <h2>月別の売上と経費</h2>
        <table class="data">
          <thead><tr><th>月</th><th>売上</th><th class="num">金額</th><th>経費</th><th class="num">金額</th></tr></thead>
          <tbody>${summary.months.map((m) => `<tr>
            <td>${Number(m.month)}月</td>
            <td><div class="bar"><span style="width:${(m.revenue / maxMonth) * 100}%"></span></div></td><td class="num">${m.revenue ? yen(m.revenue) : "<span class='muted'>—</span>"}</td>
            <td><div class="bar expense"><span style="width:${(m.expense / maxMonth) * 100}%"></span></div></td><td class="num">${m.expense ? yen(m.expense) : "<span class='muted'>—</span>"}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="panel">
        <h2>経費の内訳（上位）</h2>
        ${topExpenses.length ? `<table class="data"><tbody>${topExpenses.map((a) => `<tr><td style="width:120px">${esc(a.account)}</td><td><div class="bar expense"><span style="width:${(a.net / maxExp) * 100}%"></span></div></td><td class="num">${yen(a.net)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">まだ経費の仕訳がありません</div>`}
      </div>
    </div>
    <div class="panel">
      <h2>最近の仕訳 <a class="small" href="#/journal">すべて見る →</a></h2>
      ${entriesTable(recent.items, { compact: true })}
    </div>`;
  main.querySelector("#dash-entry").addEventListener("click", () => openEntryForm({}, () => renderDashboard(main)));
  main.querySelector("#dash-upload").addEventListener("click", () => openUploadDialog(() => { location.hash = "#/evidence"; }));
}
