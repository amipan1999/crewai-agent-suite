import { api } from "./api.js";
import { state, toast } from "./ui.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderJournal } from "./views/journal.js";
import { renderEvidence } from "./views/evidence.js";
import { renderInvoices, renderInvoicePrint } from "./views/invoices.js";
import { renderReports } from "./views/reports.js";
import { renderData } from "./views/data.js";
import { renderMasters } from "./views/masters.js";
import { renderSettings } from "./views/settings.js";

const routes = {
  dashboard: renderDashboard,
  journal: renderJournal,
  evidence: renderEvidence,
  invoices: renderInvoices,
  reports: renderReports,
  data: renderData,
  masters: renderMasters,
  settings: renderSettings,
};

export async function loadMeta() {
  state.meta = await api.get("/api/meta");
  const years = new Set(state.meta.years.map(Number));
  years.add(Number(state.meta.settings.fiscal_year || new Date().getFullYear()));
  years.add(new Date().getFullYear());
  years.add(state.year);
  const sel = document.getElementById("year-select");
  sel.innerHTML = [...years].sort((a, b) => b - a).map((y) => `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}年</option>`).join("");
  document.getElementById("data-dir").textContent = `保存先: ${state.meta.data_dir}`;
  const name = state.meta.settings.business_name || state.meta.settings.owner_name;
  document.getElementById("brand-sub").textContent = name || "個人事業主の会計帳簿";
}

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [path, query] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "dashboard", parts, query: new URLSearchParams(query || "") };
}

export async function render() {
  const main = document.getElementById("main");
  const route = parseHash();
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route.name));
  try {
    if (route.name === "invoices" && route.parts[2] === "print") {
      await renderInvoicePrint(main, Number(route.parts[1]));
      return;
    }
    const fn = routes[route.name] || renderDashboard;
    await fn(main, route);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="panel"><div class="error-box">画面の描画に失敗しました: ${err.message}</div></div>`;
  }
}

window.addEventListener("hashchange", render);
document.getElementById("year-select").addEventListener("change", (e) => {
  state.year = Number(e.target.value);
  render();
});

(async () => {
  try {
    const saved = Number(localStorage.getItem("kaikei.year"));
    if (saved) state.year = saved;
  } catch (_) { /* ignore */ }
  try {
    await loadMeta();
    if (!state.meta.years.includes(String(state.year)) && state.meta.settings.fiscal_year) {
      // データが無い年度なら設定の会計年度を優先
      if (!localStorage.getItem("kaikei.year")) state.year = Number(state.meta.settings.fiscal_year);
    }
    await loadMeta();
  } catch (err) {
    toast("サーバーに接続できません: " + err.message, "error");
  }
  await render();
})();

document.getElementById("year-select").addEventListener("change", (e) => {
  try { localStorage.setItem("kaikei.year", e.target.value); } catch (_) { /* ignore */ }
});
