// トップページ: 街マップ・パスポート・お問い合わせフォーム
(function () {
  const { pavilions, consult } = window.TOWN;
  const { esc } = window.Town;
  const P = window.Passport;

  // パスポート（ヒーローのチケット）
  document.getElementById("passport-no").textContent = "No. " + P.get().no;
  document.getElementById("passport-stamps").innerHTML = [...pavilions, consult]
    .map(
      (p) =>
        `<div class="stamp-slot${P.has(p.id) ? " on" : ""}" style="--stamp:${p.color}" title="${esc(p.name)}">${p.icon}</div>`,
    )
    .join("");
  document.getElementById("passport-progress").textContent =
    `${P.count()} / ${pavilions.length + 1} 館`;

  // スカイライン
  document.getElementById("skyline").innerHTML = pavilions
    .map((p, i) => `<div class="bldg" style="--c:${p.color};height:${[70, 100, 60, 88, 76, 120][i % 6]}%">${p.icon}</div>`)
    .join("");

  // 街マップ（社長室はメインパビリオンとして大きく表示）
  const card = (p) => {
    const featured = p.id === "ceo";
    return `
      <a class="pav${featured ? " featured" : ""}" style="--c:${p.color}" href="pavilion.html?p=${p.id}">
        ${P.has(p.id) ? '<div class="pav-stamp">体験<br>済み</div>' : ""}
        <div class="pav-roof" aria-hidden="true">${p.icon}</div>
        <div class="pav-body">
          <h3>${esc(p.name)}${featured ? "（メインパビリオン）" : ""}</h3>
          <p>${esc(p.tagline)}。あなたは<b>${esc(p.role)}</b>として、AI部下に仕事を任せます。</p>
          <div class="pav-meta"><span>ミッション ${p.missions.length}本 ・ 約3分</span><span class="go">入館する →</span></div>
        </div>
      </a>`;
  };
  document.getElementById("map").innerHTML = pavilions.map(card).join("");

  // お問い合わせ
  const form = document.getElementById("contact-form");
  const msg = document.getElementById("form-msg");
  const visited = P.visitedNames();
  document.getElementById("visited-note").textContent = visited.length
    ? `体験したパビリオン（${visited.join("・")}）も一緒に送信されます。`
    : "街で体験してからご相談いただくと、お話がスムーズです。";

  const plan = new URLSearchParams(location.search).get("plan");
  if (plan) form.plan.value = plan;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.visited = visited;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    msg.className = "form-msg";
    msg.textContent = "送信しています…";
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "送信に失敗しました。");
      form.reset();
      msg.className = "form-msg ok";
      msg.textContent = "ご相談を受け付けました。2営業日以内に担当コンサルタントからご連絡します。";
    } catch (err) {
      msg.className = "form-msg err";
      msg.textContent = err.message || "送信に失敗しました。時間をおいてお試しください。";
    } finally {
      btn.disabled = false;
    }
  });
})();
