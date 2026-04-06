import { useState, useRef, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════
   CrewAI ORCHESTRATION SYSTEM
   社長（人間）→ CrewAI → 各部門エージェント
   ═══════════════════════════════════════════════════ */

const P = {
  bg:"#05080f", surface:"#0a1018", card:"#0f1724", card2:"#141e30",
  border:"#182540", text:"#e8edf5", sub:"#9eb0c8", muted:"#5a6d82", dim:"#384858",
  acc:"#22d3ee", fin:"#38bdf8", ga:"#a78bfa", legal:"#34d399",
  red:"#f87171", orange:"#fb923c", yellow:"#fbbf24", green:"#34d399", pink:"#f472b6",
};

const DEPTS = [
  { id:"all", icon:"🏢", label:"全社", color:P.acc },
  { id:"finance", icon:"💰", label:"経理部", color:P.fin },
  { id:"ga", icon:"🏛", label:"総務部", color:P.ga },
  { id:"legal", icon:"⚖️", label:"法務部", color:P.legal },
];

const AGENTS = {
  finance: [
    { id:"receipt", icon:"🧾", name:"領収書処理", desc:"領収書の読み取り・仕訳" },
    { id:"purchase_order", icon:"📋", name:"発注書作成", desc:"発注書の自動生成" },
    { id:"invoice", icon:"📄", name:"請求書作成", desc:"請求書の生成・入金管理" },
    { id:"cashflow", icon:"💰", name:"入出金管理", desc:"入出金の記録・収支管理" },
    { id:"expense", icon:"🗂", name:"経費精算", desc:"経費の申請・承認" },
    { id:"financial_report", icon:"📊", name:"月次レポート", desc:"月次財務サマリー生成" },
  ],
  ga: [
    { id:"asset", icon:"🖥", name:"備品管理", desc:"備品・資産の台帳管理" },
    { id:"attendance", icon:"⏰", name:"勤怠管理", desc:"出退勤・休暇管理" },
    { id:"regulation", icon:"📖", name:"社内規程", desc:"就業規則・規程の作成" },
    { id:"document", icon:"📋", name:"届出書類", desc:"届出書類の自動生成" },
    { id:"facility", icon:"🏢", name:"施設管理", desc:"会議室・オフィス管理" },
    { id:"welfare", icon:"🎁", name:"福利厚生", desc:"福利厚生の管理・申請" },
  ],
  legal: [
    { id:"contract", icon:"📝", name:"契約書管理", desc:"契約書の作成・レビュー" },
    { id:"compliance", icon:"🛡", name:"コンプライアンス", desc:"法令遵守チェック" },
    { id:"ip", icon:"💡", name:"知的財産", desc:"特許・商標の管理" },
    { id:"dispute", icon:"⚠️", name:"紛争対応", desc:"トラブル・クレーム対応" },
    { id:"legal_consult", icon:"⚖️", name:"法務相談", desc:"法務全般の相談" },
    { id:"privacy", icon:"🔒", name:"個人情報保護", desc:"プライバシー・GDPR対応" },
  ],
};

const ALL_AGENTS = [...AGENTS.finance, ...AGENTS.ga, ...AGENTS.legal];

const SK = "crewai-orchestrator-v1";
const loadS = async () => { try { const r = await window.storage.get(SK); return r ? JSON.parse(r.value) : null; } catch { return null; } };
const saveS = async (d) => { try { await window.storage.set(SK, JSON.stringify(d)); } catch(e) { console.error(e); } };

const callAI = async (msgs, sys) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, system: sys, messages: msgs }),
  });
  const d = await r.json();
  return d.content?.map(c => c.text || "").join("") || "";
};
const pJ = t => JSON.parse(t.replace(/```json|```/g, "").trim());

/* ═══ UI ATOMS ═══ */
const iS = { width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${P.border}`, background:P.bg, color:P.text, fontSize:13, outline:"none", fontFamily:"inherit" };
const Badge = ({ text, color }) => <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, fontWeight:600, background:`${color}20`, color, whiteSpace:"nowrap" }}>{text}</span>;
const Stat = ({ label, value, color = P.acc, icon }) => (
  <div style={{ background:P.card, borderRadius:10, padding:"14px 18px", border:`1px solid ${P.border}`, flex:1, minWidth:140 }}>
    <div style={{ fontSize:9, color:P.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2, marginBottom:4 }}>{icon} {label}</div>
    <div style={{ fontSize:20, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color }}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════════════════
   CREW COMMANDER - Natural Language Router
   ═══════════════════════════════════════════════════ */
function CrewCommander({ data, setData }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const inputRef = useRef();

  const ROUTER_SYSTEM = `あなたはCrewAIオーケストレーターです。社長からの指示を受け、適切なAIエージェントに仕事を振り分けて実行します。

利用可能なエージェント:
【経理部】領収書処理, 発注書作成, 請求書作成, 入出金管理, 経費精算, 月次レポート
【総務部】備品管理, 勤怠管理, 社内規程, 届出書類, 施設管理, 福利厚生
【法務部】契約書管理, コンプライアンス, 知的財産, 紛争対応, 法務相談, 個人情報保護

指示に対して以下のJSONのみ返してください:
{
  "understanding": "指示の理解(30字)",
  "plan": [
    {
      "agent_id": "エージェントID",
      "agent_name": "エージェント名",
      "department": "finance/ga/legal",
      "task": "このエージェントが実行するタスク(詳細に)",
      "priority": "high/medium/low",
      "estimated_time": "想定所要時間"
    }
  ],
  "dependencies": "エージェント間の依存関係があれば記述",
  "total_steps": 数値,
  "ceo_summary": "社長への報告サマリー(100字)"
}

エージェントIDは以下から選択:
receipt, purchase_order, invoice, cashflow, expense, financial_report,
asset, attendance, regulation, document, facility, welfare,
contract, compliance, ip, dispute, legal_consult, privacy`;

  const EXEC_SYSTEM = `あなたは指定されたタスクを実行するAIエージェントです。
タスクの結果をJSONのみで返してください:
{
  "status": "completed/in_progress/needs_input",
  "result": "実行結果の詳細(200字以内)",
  "output_data": {},
  "next_steps": ["次のステップ1"],
  "warnings": ["注意事項があれば"]
}`;

  const execute = async () => {
    if (!input.trim()) return;
    const query = input; setInput(""); setBusy(true);

    const newResult = {
      id: Date.now().toString(),
      query,
      timestamp: new Date().toLocaleString("ja-JP"),
      status: "routing",
      plan: null,
      executions: [],
    };
    setResults(prev => [newResult, ...prev]);

    try {
      // Step 1: Route
      const routeText = await callAI([{ role: "user", content: query }], ROUTER_SYSTEM);
      const plan = pJ(routeText);
      newResult.plan = plan;
      newResult.status = "executing";
      setResults(prev => prev.map(r => r.id === newResult.id ? { ...newResult } : r));

      // Step 2: Execute each agent task
      for (let i = 0; i < plan.plan.length; i++) {
        const task = plan.plan[i];
        const agentInfo = ALL_AGENTS.find(a => a.id === task.agent_id) || { icon: "🤖", name: task.agent_name };

        try {
          const execText = await callAI(
            [{ role: "user", content: `あなたは「${task.agent_name}」エージェントです。\n\n実行タスク: ${task.task}\n\n社長からの元の指示: ${query}\n\nこのタスクを実行して結果を報告してください。` }],
            EXEC_SYSTEM
          );
          const execResult = pJ(execText);
          newResult.executions.push({
            agent: task,
            agentInfo,
            result: execResult,
            completed: true,
          });
        } catch (e) {
          newResult.executions.push({
            agent: task,
            agentInfo,
            result: { status: "error", result: "実行に失敗しました", output_data: {}, next_steps: [], warnings: [] },
            completed: false,
          });
        }
        setResults(prev => prev.map(r => r.id === newResult.id ? { ...newResult } : r));
      }

      // Step 3: Generate CEO summary
      const summaryText = await callAI(
        [{ role: "user", content: `社長への報告を作成してください。\n\n指示: ${query}\n\n実行結果:\n${newResult.executions.map((ex, i) => `${i + 1}. ${ex.agent.agent_name}: ${ex.result.result}`).join("\n")}` }],
        `社長への報告書生成AI。JSONのみ。{"title":"報告タイトル","executive_summary":"エグゼクティブサマリー(150字)","results":[{"department":"部門","agent":"エージェント名","status":"完了/進行中/要確認","summary":"結果要約"}],"action_items":["アクション1"],"risks":["リスクがあれば"],"recommendation":"総合的な提言(100字)"}`
      );
      newResult.summary = pJ(summaryText);
      newResult.status = "completed";

      // Save to task log
      setData(prev => ({
        ...prev,
        taskLog: [{ id: newResult.id, query, timestamp: newResult.timestamp, plan: plan, summary: newResult.summary }, ...(prev.taskLog || []).slice(0, 49)],
      }));

    } catch (e) {
      console.error(e);
      newResult.status = "error";
    }

    setResults(prev => prev.map(r => r.id === newResult.id ? { ...newResult } : r));
    setBusy(false);
  };

  return (
    <div>
      {/* Command Input */}
      <div style={{ background: P.card, borderRadius: 14, border: `1px solid ${P.border}`, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: P.acc, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>🎯 社長コマンド</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !busy && execute()}
            placeholder="指示を入力... 例:「来月の新入社員の入社手続きを全て準備して」"
            style={{ ...iS, flex: 1, fontSize: 14, padding: "10px 14px" }}
          />
          <button onClick={execute} disabled={busy || !input.trim()} style={{
            padding: "10px 28px", borderRadius: 10, border: "none",
            background: busy ? P.dim : `linear-gradient(135deg, ${P.acc}, ${P.legal})`,
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1, transition: "all .2s", whiteSpace: "nowrap",
          }}>
            {busy ? "⏳ 実行中..." : "🚀 実行"}
          </button>
        </div>

        {/* Quick Commands */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {[
            "今月の経営状況を全部門から報告して",
            "新入社員の受け入れ準備をして",
            "取引先とのNDA契約書を作成して",
            "今月の経費を集計してレポート作成",
            "就業規則をテレワーク対応に更新して",
            "個人情報保護のチェックリストを作成",
          ].map(cmd => (
            <button key={cmd} onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${P.border}`, background: "transparent", color: P.sub, fontSize: 10, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.target.style.borderColor = P.acc; e.target.style.color = P.acc; }}
              onMouseLeave={e => { e.target.style.borderColor = P.border; e.target.style.color = P.sub; }}>
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.map(r => (
        <div key={r.id} style={{ background: P.card, borderRadius: 14, border: `1px solid ${P.border}`, marginBottom: 16, overflow: "hidden", animation: "fadeIn .4s ease" }}>
          {/* Header */}
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${P.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <Badge text={r.status === "completed" ? "✓ 完了" : r.status === "error" ? "✗ エラー" : r.status === "executing" ? "⏳ 実行中" : "🔄 ルーティング"} color={r.status === "completed" ? P.green : r.status === "error" ? P.red : P.yellow} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.text }}>{r.query}</div>
              <div style={{ fontSize: 10, color: P.dim, marginTop: 2 }}>{r.timestamp}</div>
            </div>
          </div>

          {/* Plan */}
          {r.plan && (
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${P.border}` }}>
              <div style={{ fontSize: 11, color: P.acc, fontWeight: 600, marginBottom: 8 }}>📋 実行プラン ({r.plan.total_steps}ステップ)</div>
              <div style={{ fontSize: 12, color: P.sub, marginBottom: 8 }}>{r.plan.understanding}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.plan.plan.map((step, i) => {
                  const ag = ALL_AGENTS.find(a => a.id === step.agent_id);
                  const exec = r.executions[i];
                  const deptColor = step.department === "finance" ? P.fin : step.department === "ga" ? P.ga : P.legal;
                  return (
                    <div key={i} style={{
                      padding: "8px 12px", borderRadius: 8,
                      background: exec?.completed ? `${P.green}10` : exec ? `${P.yellow}10` : P.surface,
                      border: `1px solid ${exec?.completed ? `${P.green}30` : P.border}`,
                      minWidth: 150, flex: 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                        <span style={{ fontSize: 14 }}>{ag?.icon || "🤖"}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: deptColor }}>{step.agent_name}</span>
                        {exec?.completed && <span style={{ fontSize: 10, color: P.green }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 10, color: P.muted, lineHeight: 1.5 }}>{step.task.slice(0, 60)}{step.task.length > 60 ? "..." : ""}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <Badge text={step.priority} color={step.priority === "high" ? P.red : step.priority === "medium" ? P.orange : P.green} />
                        <span style={{ fontSize: 9, color: P.dim }}>{step.estimated_time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {r.plan.dependencies && <div style={{ fontSize: 10, color: P.muted, marginTop: 6 }}>🔗 {r.plan.dependencies}</div>}
            </div>
          )}

          {/* Execution Results */}
          {r.executions.length > 0 && (
            <div style={{ padding: "12px 18px", borderBottom: r.summary ? `1px solid ${P.border}` : "none" }}>
              <div style={{ fontSize: 11, color: P.yellow, fontWeight: 600, marginBottom: 8 }}>⚡ エージェント実行結果</div>
              {r.executions.map((ex, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: P.surface, border: `1px solid ${P.border}`, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{ex.agentInfo.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: P.text }}>{ex.agent.agent_name}</span>
                    <Badge text={ex.result.status === "completed" ? "完了" : ex.result.status === "error" ? "エラー" : "要確認"} color={ex.result.status === "completed" ? P.green : ex.result.status === "error" ? P.red : P.orange} />
                  </div>
                  <div style={{ fontSize: 12, color: P.sub, lineHeight: 1.7, marginBottom: 4 }}>{ex.result.result}</div>
                  {ex.result.next_steps?.length > 0 && (
                    <div style={{ fontSize: 10, color: P.muted }}>
                      次のステップ: {ex.result.next_steps.join(" → ")}
                    </div>
                  )}
                  {ex.result.warnings?.length > 0 && (
                    <div style={{ fontSize: 10, color: P.orange, marginTop: 2 }}>
                      ⚠ {ex.result.warnings.join(" / ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* CEO Summary */}
          {r.summary && (
            <div style={{ padding: "14px 18px", background: `${P.acc}06` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: P.acc, marginBottom: 8 }}>📊 社長への報告: {r.summary.title}</div>
              <div style={{ fontSize: 13, color: P.text, lineHeight: 1.8, marginBottom: 10 }}>{r.summary.executive_summary}</div>

              {r.summary.results?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {r.summary.results.map((res, i) => (
                    <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: P.card, border: `1px solid ${P.border}`, fontSize: 11, flex: 1, minWidth: 150 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        <Badge text={res.department} color={res.department === "経理" ? P.fin : res.department === "総務" ? P.ga : P.legal} />
                        <span style={{ fontWeight: 600, color: P.text }}>{res.agent}</span>
                      </div>
                      <div style={{ color: P.sub }}>{res.summary}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {r.summary.action_items?.length > 0 && (
                  <div style={{ padding: 10, borderRadius: 8, background: P.card, border: `1px solid ${P.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.green, marginBottom: 4 }}>✅ アクション項目</div>
                    {r.summary.action_items.map((a, i) => <div key={i} style={{ fontSize: 11, color: P.text, marginBottom: 2 }}>• {a}</div>)}
                  </div>
                )}
                {r.summary.risks?.length > 0 && (
                  <div style={{ padding: 10, borderRadius: 8, background: P.card, border: `1px solid ${P.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.orange, marginBottom: 4 }}>⚠ リスク</div>
                    {r.summary.risks.map((rk, i) => <div key={i} style={{ fontSize: 11, color: P.text, marginBottom: 2 }}>• {rk}</div>)}
                  </div>
                )}
              </div>
              {r.summary.recommendation && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: `${P.acc}10`, border: `1px solid ${P.acc}30`, fontSize: 12, color: P.acc }}>
                  💡 {r.summary.recommendation}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {results.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: P.dim }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>社長コマンドを入力してください</div>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>自然言語で指示するだけで、適切なAIエージェントが自動的に実行します</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   AGENT STATUS MONITOR
   ═══════════════════════════════════════════════════ */
function AgentMonitor({ data }) {
  const taskLog = data.taskLog || [];

  return (
    <div>
      {/* Agent Grid */}
      {Object.entries(AGENTS).map(([dept, agents]) => {
        const deptInfo = DEPTS.find(d => d.id === dept);
        return (
          <div key={dept} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{deptInfo.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: deptInfo.color }}>{deptInfo.label}</span>
              <div style={{ flex: 1, height: 1, background: P.border }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {agents.map(agent => (
                <div key={agent.id} style={{
                  padding: "14px 14px", borderRadius: 10, background: P.card,
                  border: `1px solid ${P.border}`, transition: "all .2s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>{agent.icon}</span>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: P.green, boxShadow: `0 0 6px ${P.green}` }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 2 }}>{agent.name}</div>
                  <div style={{ fontSize: 10, color: P.muted, lineHeight: 1.4 }}>{agent.desc}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Task Log */}
      {taskLog.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: P.muted, marginBottom: 10 }}>📜 タスク履歴</div>
          {taskLog.slice(0, 20).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: P.card, border: `1px solid ${P.border}`, marginBottom: 4, gap: 10, fontSize: 11 }}>
              <span style={{ color: P.dim, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, flexShrink: 0 }}>{t.timestamp}</span>
              <div style={{ flex: 1, color: P.text }}>{t.query}</div>
              <span style={{ color: P.muted, fontSize: 10 }}>{t.plan?.total_steps || 0}ステップ</span>
              <Badge text="完了" color={P.green} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CROSS-DEPT DASHBOARD
   ═══════════════════════════════════════════════════ */
function CrossDeptDashboard({ data }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  const genReport = async () => {
    setBusy(true);
    try {
      const text = await callAI(
        [{ role: "user", content: `全社の現状データ:\nタスク履歴: ${(data.taskLog || []).length}件\n\n全社横断の経営レポートを生成してください。` }],
        `経営ダッシュボードAI。JSONのみ。{"date":"${new Date().toISOString().slice(0,10)}","company_health":"良好/注意/要改善","departments":[{"name":"経理部","status":"良好/注意/要改善","highlights":["ポイント"],"metrics":{"key":"value"}},{"name":"総務部","status":"良好/注意/要改善","highlights":["ポイント"],"metrics":{"key":"value"}},{"name":"法務部","status":"良好/注意/要改善","highlights":["ポイント"],"metrics":{"key":"value"}}],"cross_dept_issues":["部門横断の課題"],"strategic_recommendations":["戦略的提言"],"weekly_priorities":["今週の優先事項"]}`
      );
      setReport(pJ(text));
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={genReport} disabled={busy} style={{
          padding: "10px 24px", borderRadius: 10, border: "none",
          background: busy ? P.dim : `linear-gradient(135deg, ${P.fin}, ${P.ga}, ${P.legal})`,
          color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer",
        }}>
          {busy ? "⏳ 分析中..." : "📊 全社レポート生成"}
        </button>
      </div>

      {/* Task Stats */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat icon="📋" label="総タスク数" value={`${(data.taskLog || []).length}`} color={P.acc} />
        <Stat icon="🤖" label="稼働エージェント" value={`${ALL_AGENTS.length}`} color={P.green} />
        <Stat icon="🏢" label="部門数" value="3" color={P.ga} />
      </div>

      {report && (
        <div style={{ animation: "fadeIn .4s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: P.text }}>全社経営レポート</div>
            <Badge text={report.company_health} color={report.company_health === "良好" ? P.green : report.company_health === "注意" ? P.orange : P.red} />
            <span style={{ fontSize: 10, color: P.dim }}>{report.date}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            {(report.departments || []).map((dept, i) => {
              const colors = [P.fin, P.ga, P.legal];
              return (
                <div key={i} style={{ background: P.card, borderRadius: 12, border: `1px solid ${P.border}`, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colors[i] }}>{dept.name}</span>
                    <Badge text={dept.status} color={dept.status === "良好" ? P.green : dept.status === "注意" ? P.orange : P.red} />
                  </div>
                  {(dept.highlights || []).map((h, j) => <div key={j} style={{ fontSize: 11, color: P.sub, marginBottom: 3 }}>• {h}</div>)}
                  {dept.metrics && Object.entries(dept.metrics).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: P.muted, marginTop: 4, padding: "2px 0", borderTop: `1px solid ${P.border}22` }}>
                      <span>{k}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", color: P.sub }}>{v}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { t: "🔗 部門横断の課題", items: report.cross_dept_issues, c: P.orange },
              { t: "💡 戦略的提言", items: report.strategic_recommendations, c: P.acc },
              { t: "🎯 今週の優先事項", items: report.weekly_priorities, c: P.green },
            ].map(sec => (
              <div key={sec.t} style={{ background: P.card, borderRadius: 10, border: `1px solid ${P.border}`, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: sec.c, marginBottom: 6 }}>{sec.t}</div>
                {(sec.items || []).map((it, i) => <div key={i} style={{ fontSize: 11, color: P.text, lineHeight: 1.7, marginBottom: 3, paddingLeft: 10, position: "relative" }}><span style={{ position: "absolute", left: 0, color: sec.c }}>•</span>{it}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App() {
  const [view, setView] = useState("command"); // command | monitor | dashboard
  const [data, setData] = useState({ taskLog: [] });
  const [loaded, setLoaded] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

  useEffect(() => { (async () => { const s = await loadS(); if (s) setData(s); setLoaded(true); })(); }, []);
  useEffect(() => { if (loaded) saveS(data); }, [data, loaded]);
  const setD = useCallback(fn => setData(prev => typeof fn === "function" ? fn(prev) : fn), []);

  const VIEWS = [
    { id: "command", icon: "🎯", label: "コマンド", desc: "AIエージェントに指示", color: P.acc },
    { id: "monitor", icon: "📡", label: "モニター", desc: "エージェント稼働状況", color: P.green },
    { id: "dashboard", icon: "📊", label: "ダッシュボード", desc: "全社横断レポート", color: P.yellow },
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Helvetica Neue',sans-serif", background: P.bg, color: P.text, minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${P.border};border-radius:4px;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}
      `}</style>

      {/* Sidebar */}
      <div style={{ width: sideOpen ? 230 : 60, background: P.surface, borderRight: `1px solid ${P.border}`, padding: sideOpen ? "16px 12px" : "16px 8px", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width .2s", overflow: "hidden" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, paddingLeft: 2, cursor: "pointer" }} onClick={() => setSideOpen(!sideOpen)}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg, ${P.acc}, ${P.legal})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0,
            boxShadow: `0 0 20px ${P.acc}40`,
          }}>AI</div>
          {sideOpen && <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em", background: `linear-gradient(90deg, ${P.acc}, ${P.legal})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CrewAI</div>
            <div style={{ fontSize: 8, color: P.muted, fontWeight: 600, letterSpacing: 1.5, marginTop: -1 }}>ORCHESTRATION SYSTEM</div>
          </div>}
        </div>

        {/* Role indicator */}
        {sideOpen && <div style={{ padding: "8px 10px", borderRadius: 8, background: `${P.acc}08`, border: `1px solid ${P.acc}20`, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: P.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👔</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: P.text }}>社長 (CEO)</div>
            <div style={{ fontSize: 9, color: P.muted }}>全権限アクセス</div>
          </div>
        </div>}

        {/* Nav */}
        <div style={{ marginBottom: 16 }}>
          {sideOpen && <div style={{ fontSize: 9, color: P.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, padding: "0 8px", marginBottom: 6 }}>操作</div>}
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} title={v.label} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: sideOpen ? "10px 10px" : "10px 0", justifyContent: sideOpen ? "flex-start" : "center",
              borderRadius: 8, border: "none", cursor: "pointer",
              background: view === v.id ? `${v.color}14` : "transparent",
              color: view === v.id ? v.color : P.muted,
              fontSize: 12, fontWeight: view === v.id ? 600 : 400,
              marginBottom: 2, transition: "all .15s", textAlign: "left",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{v.icon}</span>
              {sideOpen && <div>
                <div>{v.label}</div>
                <div style={{ fontSize: 9, color: P.dim, fontWeight: 400 }}>{v.desc}</div>
              </div>}
            </button>
          ))}
        </div>

        {/* Department Status */}
        {sideOpen && <>
          <div style={{ fontSize: 9, color: P.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, padding: "0 8px", marginBottom: 6 }}>部門ステータス</div>
          {DEPTS.filter(d => d.id !== "all").map(dept => (
            <div key={dept.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, marginBottom: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: P.green, boxShadow: `0 0 4px ${P.green}`, animation: "pulse 3s infinite" }} />
              <span style={{ fontSize: 11, color: P.sub }}>{dept.icon} {dept.label}</span>
              <span style={{ fontSize: 9, color: P.dim, marginLeft: "auto" }}>{AGENTS[dept.id].length}体</span>
            </div>
          ))}
        </>}

        <div style={{ flex: 1 }} />

        {/* Footer */}
        {sideOpen && <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: P.green, boxShadow: `0 0 6px ${P.green}` }} />
            <span style={{ fontSize: 10, color: P.green, fontWeight: 600 }}>全システム稼働中</span>
          </div>
          <div style={{ fontSize: 9, color: P.dim, padding: "4px 8px", lineHeight: 1.5 }}>
            {ALL_AGENTS.length}エージェント / 3部門
          </div>
        </div>}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "20px 28px", overflow: "auto" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div key={view} style={{ animation: "fadeIn .3s ease" }}>
            {view === "command" && <CrewCommander data={data} setData={setD} />}
            {view === "monitor" && <AgentMonitor data={data} />}
            {view === "dashboard" && <CrossDeptDashboard data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}
