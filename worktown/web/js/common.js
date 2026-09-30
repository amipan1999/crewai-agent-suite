// 全ページ共通: パスポート（スタンプ帳）と小さな Markdown レンダラー
(function () {
  const KEY = "worktown.passport.v1";

  function load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || "null");
      if (p && typeof p === "object" && p.visited) return p;
    } catch (e) { /* プライベートモード等では保存しない */ }
    return { no: String(Math.floor(100000 + Math.random() * 900000)), visited: {} };
  }
  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* noop */ }
  }

  const passport = load();
  save(passport);

  window.Passport = {
    get: () => passport,
    stamp(pavilionId, missionId) {
      const list = passport.visited[pavilionId] || (passport.visited[pavilionId] = []);
      if (!list.includes(missionId)) list.push(missionId);
      save(passport);
    },
    has: (pavilionId) => !!(passport.visited[pavilionId] && passport.visited[pavilionId].length),
    count: () => Object.keys(passport.visited).filter((k) => passport.visited[k].length).length,
    visitedNames() {
      const all = [...window.TOWN.pavilions, window.TOWN.consult];
      return all.filter((p) => this.has(p.id)).map((p) => p.name);
    },
  };

  // ---------- Markdown（AI の出力を安全に表示するための最小実装） ----------
  const esc = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }

  const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  function markdown(src) {
    const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
        i++;
      } else if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
        out.push("<hr>");
        i++;
      } else if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(cells(lines[i++]));
        out.push(
          '<div class="table-wrap"><table><thead><tr>' +
            head.map((c) => `<th>${inline(c)}</th>`).join("") +
            "</tr></thead><tbody>" +
            body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
            "</tbody></table></div>",
        );
      } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
          i++;
        }
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
      } else if (/^>\s?/.test(line)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${q.map(inline).join("<br>")}</blockquote>`);
      } else {
        const para = [];
        while (
          i < lines.length && lines[i].trim() &&
          !/^(#{1,4}\s|>|\s*\||\s*([-*+]|\d+[.)])\s+)/.test(lines[i])
        ) para.push(lines[i++]);
        if (!para.length) para.push(lines[i++]);
        out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      }
    }
    return out.join("\n");
  }

  window.Town = { esc, markdown };

  // パスポートのスタンプ数をナビに表示
  document.addEventListener("DOMContentLoaded", () => {
    const chip = document.querySelector("[data-passport-count]");
    if (chip) chip.textContent = `${window.Passport.count()} / ${window.TOWN.pavilions.length + 1}`;
  });
})();
