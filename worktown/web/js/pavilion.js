// パビリオン（職業体験）ページ
(function () {
  const { pavilions, consult } = window.TOWN;
  const { esc, markdown } = window.Town;
  const all = [...pavilions, consult];
  const qs = new URLSearchParams(location.search);
  const pav = all.find((p) => p.id === qs.get("p")) || pavilions[0];
  let mission = pav.missions.find((m) => m.id === qs.get("m")) || pav.missions[0];

  const $ = (id) => document.getElementById(id);
  document.title = `${pav.name}｜AI WORK TOWN`;
  document.documentElement.style.setProperty("--c", pav.color);

  $("pv-icon").textContent = pav.icon;
  $("pv-name").textContent = pav.name;
  $("pv-tagline").textContent = pav.tagline;
  $("pv-role").textContent = pav.role;

  // ---------- ミッション切替 ----------
  const tabs = $("tabs");
  function renderTabs() {
    tabs.innerHTML = pav.missions
      .map(
        (m, i) =>
          `<button class="tab" role="tab" aria-selected="${m.id === mission.id}" data-id="${m.id}">ミッション${i + 1}：${esc(m.title)}</button>`,
      )
      .join("");
    tabs.hidden = pav.missions.length < 2;
  }
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b || running) return;
    mission = pav.missions.find((m) => m.id === b.dataset.id);
    history.replaceState(null, "", `?p=${pav.id}&m=${mission.id}`);
    renderMission();
  });

  const input = $("order-input");
  function renderMission() {
    renderTabs();
    $("mission-title").textContent = mission.title;
    $("scenario").textContent = mission.scenario;
    $("order-label").textContent = mission.inputLabel;
    input.value = mission.sample;
    updateCount();
    renderCrew(-1, false);
    $("result").hidden = true;
    $("error").hidden = true;
    setMeter(0, "指示を待っています");
  }

  const updateCount = () => ($("count").textContent = `${input.value.length} / 3000`);
  input.addEventListener("input", updateCount);
  $("reset-sample").addEventListener("click", () => {
    input.value = mission.sample;
    updateCount();
  });

  // ---------- AIチーム（進捗表示） ----------
  function renderCrew(activeIndex, allDone) {
    $("crew").innerHTML = mission.crew
      .map((c, i) => {
        const state = allDone || i < activeIndex ? "done" : i === activeIndex ? "working" : "";
        const label = state === "done" ? "完了" : state === "working" ? "作業中" : "待機中";
        return `<div class="agent ${state}">
          <div class="av" aria-hidden="true">${c.icon}</div>
          <div><b>${esc(c.name)}</b><small>${esc(c.role)}</small></div>
          <span class="st">${label}</span>
        </div>`;
      })
      .join("");
  }
  function setMeter(pct, label) {
    $("meter-fill").style.width = `${pct}%`;
    $("meter-text").textContent = label;
    $("meter-pct").textContent = pct ? `${Math.round(pct)}%` : "";
  }

  // 生成中の JSON テキストから、どのメンバーまで作業が進んだかを推定する
  function progress(buf) {
    const n = mission.crew.length;
    if (buf.includes('"deliverable"')) {
      renderCrew(n, true);
      return setMeter(Math.min(95, 40 + buf.length / 60), "成果物を仕上げています…");
    }
    const started = (buf.match(/"agent"\s*:/g) || []).length;
    const idx = Math.min(Math.max(started - 1, 0), n - 1);
    renderCrew(idx, false);
    setMeter(Math.min(40, 5 + buf.length / 20), `${mission.crew[idx].name}が作業中…`);
  }

  // ---------- 実行 ----------
  let running = false;
  $("order-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (running) return;
    const text = input.value.trim();
    if (!text) return input.focus();

    running = true;
    $("run").disabled = true;
    $("error").hidden = true;
    $("result").hidden = true;
    renderCrew(0, false);
    setMeter(3, "AIチームが指示を読み込んでいます…");
    $("crew-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const result = await callApi({ pavilion: pav.id, mission: mission.id, input: text });
      renderCrew(mission.crew.length, true);
      setMeter(100, "完了しました");
      showResult(result);
    } catch (err) {
      renderCrew(-1, false);
      setMeter(0, "中断しました");
      $("error").hidden = false;
      $("error").textContent = err.message;
    } finally {
      running = false;
      $("run").disabled = false;
    }
  });

  async function callApi(payload) {
    let r;
    try {
      r = await fetch("/api/experience", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error("AIチームに接続できませんでした。通信環境をご確認のうえ、もう一度お試しください。");
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `エラーが発生しました（${r.status}）`);
    }

    // NDJSON を1行ずつ読む
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "delta") {
          buf += ev.text;
          progress(buf);
        } else if (ev.type === "done") {
          return ev.result;
        } else if (ev.type === "error") {
          throw new Error(ev.error);
        }
      }
    }
    throw new Error("通信が途中で切れました。もう一度お試しください。");
  }

  // ---------- 結果 ----------
  function showResult(res) {
    $("log").innerHTML = (res.crew_log || [])
      .map(
        (l, i) => `<li><span class="dot">${i + 1}</span><div>
          <b>${esc(l.agent)}：${esc(l.action)}</b><p>${esc(l.output)}</p></div></li>`,
      )
      .join("");
    $("deliverable").innerHTML = markdown(res.deliverable);
    $("checks").innerHTML = (res.review_points || []).map((t) => `<li>${esc(t)}</li>`).join("");

    const manual = mission.manualMinutes;
    const ai = Math.max(1, Number(res.impact?.ai_minutes) || 1);
    const saved = Math.max(0, Math.round((1 - ai / manual) * 100));
    $("impact").innerHTML = `
      <div class="saved">約${saved}%<small style="font-size:14px;color:var(--muted);font-weight:500"> の時間を削減</small></div>
      <div class="bars">
        <div class="bar-row"><span>人だけ</span><div class="track"><i style="background:var(--muted)" data-w="100"></i></div><span class="v">${manual}分</span></div>
        <div class="bar-row"><span>AI＋人</span><div class="track"><i style="background:var(--teal)" data-w="${Math.min(100, (ai / manual) * 100)}"></i></div><span class="v">${ai}分</span></div>
      </div>
      <p style="font-size:14px;color:var(--sub)">${esc(res.impact?.note || "")}</p>
      <p style="font-size:14px"><b>実務への次の一歩：</b>${esc(res.next_step || "")}</p>`;
    requestAnimationFrame(() =>
      document.querySelectorAll("#impact .track i").forEach((el) => (el.style.width = el.dataset.w + "%")),
    );

    window.Passport.stamp(pav.id, mission.id);
    const chip = document.querySelector("[data-passport-count]");
    if (chip) chip.textContent = `${window.Passport.count()} / ${pavilions.length + 1}`;
    $("stamp-icon").textContent = pav.icon;

    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("deliverable").innerText);
      $("copy").textContent = "コピーしました";
    } catch {
      $("copy").textContent = "コピーできませんでした";
    }
    setTimeout(() => ($("copy").textContent = "成果物をコピー"), 2000);
  });

  // 他のパビリオンへ
  $("more").innerHTML = all
    .filter((p) => p.id !== pav.id)
    .map(
      (p) =>
        `<a href="pavilion.html?p=${p.id}" style="--c:${p.color}"><span style="font-size:22px">${p.icon}</span>${esc(p.name)}${window.Passport.has(p.id) ? " ✓" : ""}</a>`,
    )
    .join("");

  renderMission();
})();
