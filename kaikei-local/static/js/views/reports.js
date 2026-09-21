import { api } from "../api.js";
import { state, esc, yen, num } from "../ui.js";

export async function renderReports(main) {
  const [summary, partners] = await Promise.all([
    api.get("/api/reports/summary", { year: state.year }),
    api.get("/api/reports/partners", { year: state.year }),
  ]);
  const labels = state.meta?.category_labels || {};
  const revenue = summary.accounts.filter((a) => a.category === "revenue");
  const expense = summary.accounts.filter((a) => a.category === "expense");
  const balance = summary.accounts.filter((a) => !["revenue", "expense"].includes(a.category));
  const row = (a) => `<tr><td>${esc(a.account)}</td><td class="num">${yen(a.debit)}</td><td class="num">${yen(a.credit)}</td><td class="num"><strong>${yen(a.net)}</strong></td></tr>`;
  main.innerHTML = `
    <div class="page-head">
      <h1>レポート <span class="muted small">${state.year}年（1月1日〜12月31日）</span></h1>
      <div class="actions"><a class="btn" href="/api/export/freee?year=${state.year}">仕訳帳CSVを出力</a><a class="btn" href="#/data">CSV出力・取込 →</a></div>
    </div>
    <div class="grid cols-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">売上（収入）金額</div><div class="value">${yen(summary.revenue_total)}</div></div>
      <div class="stat"><div class="label">経費 合計</div><div class="value">${yen(summary.expense_total)}</div></div>
      <div class="stat ${summary.profit >= 0 ? "ok" : "warn"}"><div class="label">差引金額</div><div class="value">${yen(summary.profit)}</div><div class="sub">青色申告決算書 損益計算書の「差引金額」に相当（各種控除前）</div></div>
    </div>
    <div class="grid cols-2">
      <div class="panel">
        <h2>損益計算書（科目別）</h2>
        <table class="data">
          <thead><tr><th>科目</th><th class="num">借方合計</th><th class="num">貸方合計</th><th class="num">残高</th></tr></thead>
          <tbody>
            <tr><td colspan="4" class="muted small">▼ ${esc(labels.revenue || "収益")}</td></tr>
            ${revenue.map(row).join("") || `<tr><td colspan="4" class="muted">—</td></tr>`}
            <tr><td colspan="4" class="muted small">▼ ${esc(labels.expense || "費用")}</td></tr>
            ${expense.map(row).join("") || `<tr><td colspan="4" class="muted">—</td></tr>`}
          </tbody>
          <tfoot><tr><td>差引金額</td><td colspan="2"></td><td class="num">${yen(summary.profit)}</td></tr></tfoot>
        </table>
      </div>
      <div>
        <div class="panel">
          <h2>月別推移</h2>
          <table class="data">
            <thead><tr><th>月</th><th class="num">売上</th><th class="num">経費</th><th class="num">差引</th></tr></thead>
            <tbody>${summary.months.map((m) => `<tr><td>${Number(m.month)}月</td><td class="num">${yen(m.revenue)}</td><td class="num">${yen(m.expense)}</td><td class="num">${yen(m.profit)}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>合計</td><td class="num">${yen(summary.revenue_total)}</td><td class="num">${yen(summary.expense_total)}</td><td class="num">${yen(summary.profit)}</td></tr></tfoot>
          </table>
        </div>
        <div class="panel">
          <h2>資産・負債・資本の動き</h2>
          ${balance.length ? `<table class="data"><thead><tr><th>科目</th><th class="num">借方合計</th><th class="num">貸方合計</th><th class="num">差引（借方−貸方）</th></tr></thead><tbody>${balance.map(row).join("")}</tbody></table>` : `<div class="empty">データがありません</div>`}
          <p class="form-hint">期首残高は管理していないため、期中の増減のみ表示しています。</p>
        </div>
      </div>
    </div>
    <div class="panel">
      <h2>取引先別 集計</h2>
      ${partners.length ? `<table class="data"><thead><tr><th>取引先</th><th class="num">売上</th><th class="num">経費</th></tr></thead><tbody>${partners.map((p) => `<tr><td>${esc(p.partner)}</td><td class="num">${yen(p.sales)}</td><td class="num">${yen(p.expenses)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">取引先が入力された仕訳がありません</div>`}
    </div>
    <div class="muted small">仕訳件数: ${num(summary.entry_count)} 件</div>`;
}
