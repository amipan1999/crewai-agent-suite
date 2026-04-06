import { useState, useRef, useEffect, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   CrewAI Agent Suite — LP + 営業AIチャットボット（Chat-to-Speech）
   ══════════════════════════════════════════════════════════════ */

const C = {
  bg: "#08090c", bg2: "#0d0f14", card: "#12151d", card2: "#181c27",
  border: "#1e2333", glow: "#00e5ff", glow2: "#7c3aed", glow3: "#f472b6",
  text: "#eef1f6", sub: "#a0aec0", muted: "#5a6578", dim: "#363d4d",
  acc: "#00e5ff", acc2: "#7c3aed", acc3: "#f472b6", green: "#34d399",
  fin: "#38bdf8", ga: "#a78bfa", legal: "#34d399", sec: "#f472b6",
};

const PRODUCTS = [
  {
    id: "finance", icon: "💰", name: "経理AI Suite",
    tagline: "領収書1枚から月次レポートまで、経理業務を完全自動化",
    color: C.fin, price: "月額 ¥49,800〜",
    agents: ["🧾 領収書処理", "📋 発注書作成", "📄 請求書作成", "💰 入出金管理", "🗂 経費精算", "📊 月次レポート"],
    features: ["領収書画像→AI自動仕訳", "発注書・請求書をAI生成", "入出金の自動集計・収支管理", "経費申請・承認ワークフロー", "月次財務レポートAI生成", "CSV出力→freee/MF連携"],
    results: ["経理業務時間 80%削減", "仕訳ミス 95%削減", "月次決算 3日→3時間"],
  },
  {
    id: "ga", icon: "🏛", name: "総務AI Suite",
    tagline: "契約書から勤怠まで、バックオフィスをAIが担う",
    color: C.ga, price: "月額 ¥49,800〜",
    agents: ["📝 契約書管理", "📖 社内規程", "🖥 備品管理", "⏰ 勤怠管理", "📋 届出書類", "⚖️ 法務相談"],
    features: ["契約書のAIレビュー・リスク判定", "就業規則など10種類の規程自動生成", "備品台帳の一元管理", "勤怠・休暇の記録・承認フロー", "入社手続き等12種の届出書類AI生成", "法務・コンプライアンスAI相談"],
    results: ["契約書レビュー 90%高速化", "規程作成 2週間→30分", "届出書類 即日完成"],
  },
  {
    id: "secretary", icon: "💼", name: "秘書AI Agent",
    tagline: "Gmail→カレンダー登録、社長の右腕になるAI秘書",
    color: C.sec, price: "月額 ¥29,800〜",
    agents: ["📧 メール解析", "🔍 予定抽出", "📅 カレンダー登録", "🗓 スケジュール確認", "📑 会議準備", "☀️ デイリーブリーフ"],
    features: ["Gmail MCP連携でメール自動取得", "AIがメールから予定を自動抽出", "Google Calendar MCPで直接登録", "今週の予定を一覧表示", "会議アジェンダ自動作成", "毎朝の業務ブリーフィング"],
    results: ["スケジュール管理工数 ゼロ", "メール確認時間 70%削減", "会議準備 自動化"],
  },
  {
    id: "crewai", icon: "🚀", name: "CrewAI Orchestrator",
    tagline: "自然言語で指示するだけ。24エージェントが連携実行",
    color: C.acc, price: "月額 ¥98,000〜（全Suite込み）",
    agents: ["🎯 自然言語コマンド", "📡 エージェントモニター", "📊 全社ダッシュボード", "💼 秘書室パネル"],
    features: ["自然言語→自動ルーティング→実行→報告", "4部門24エージェントの統合管理", "部門横断の全社レポートAI生成", "Gmail/Googleカレンダー直接連携", "タスク履歴・実行ログ完備", "社長への報告レポート自動生成"],
    results: ["経営判断スピード 5倍", "管理部門コスト 70%削減", "社長1人でAI経営を実現"],
  },
];

/* ═══ TTS ═══ */
const speak = (text, onEnd) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP"; u.rate = 1.05; u.pitch = 1.1;
  const voices = window.speechSynthesis.getVoices();
  const jp = voices.find(v => v.lang.startsWith("ja"));
  if (jp) u.voice = jp;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
};

const stopSpeak = () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); };

/* ═══ AI SALES AGENT ═══ */
const SALES_SYSTEM = `あなたは「CrewAI Agent Suite」の営業AIアシスタント「アイ」です。
明るく親しみやすい敬語で、お客様の課題をヒアリングし、最適なプロダクトを提案してください。

【製品ラインナップ】
1. 経理AI Suite（月額¥49,800〜）- 領収書処理・発注書・請求書・入出金・経費精算・月次レポート
2. 総務・法務AI Suite（月額¥49,800〜）- 契約書・社内規程・備品管理・勤怠・届出書類・法務相談
3. 秘書AI Agent（月額¥29,800〜）- Gmail解析・予定抽出・Googleカレンダー登録・会議準備
4. CrewAI Orchestrator（月額¥98,000〜全込み）- 全24エージェント統合・自然言語指示・全社ダッシュボード

【営業スタイル】
- まずお客様の会社規模・課題をヒアリング
- 具体的な導入効果を数字で示す
- 「無料デモ」「2週間トライアル」を積極的に提案
- 競合との差別化ポイント: AIが実際に業務を実行する（単なるチャットではない）
- 回答は3〜4文で簡潔に。長すぎると音声で聞きづらい
- 質問されたら的確に答え、次のステップを提案`;

const callAI = async (messages) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, system: SALES_SYSTEM, messages }),
  });
  const d = await r.json();
  return d.content?.map(c => c.text || "").join("") || "";
};

/* ═══ COMPONENTS ═══ */

function HeroSection({ onScroll, onChat }) {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 20px", position: "relative", overflow: "hidden" }}>
      {/* BG Effects */}
      <div style={{ position: "absolute", top: "20%", left: "10%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${C.acc}15, transparent 70%)`, filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "15%", width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${C.acc2}15, transparent 70%)`, filter: "blur(80px)", pointerEvents: "none" }} />

      <div style={{ animation: "fadeUp .8s ease", position: "relative", zIndex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: `${C.acc}12`, border: `1px solid ${C.acc}30`, marginBottom: 24, fontSize: 12, color: C.acc, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.acc, boxShadow: `0 0 8px ${C.acc}` }} /> 24 AI Agents Ready
        </div>

        <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 20, letterSpacing: "-0.03em" }}>
          <span style={{ color: C.text }}>社長ひとりで、</span><br />
          <span style={{ background: `linear-gradient(135deg, ${C.acc}, ${C.acc2}, ${C.acc3})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI経営を始めよう</span>
        </h1>

        <p style={{ fontSize: 18, color: C.sub, maxWidth: 600, margin: "0 auto 36px", lineHeight: 1.8, fontWeight: 400 }}>
          経理・総務・法務・秘書。<br />4部門24体のAIエージェントが、あなたの会社を動かします。
        </p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onScroll} style={{ padding: "14px 36px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.acc}, ${C.acc2})`, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 25px ${C.acc}40`, transition: "all .2s" }}>
            プロダクトを見る →
          </button>
          <button onClick={onChat} style={{ padding: "14px 36px", borderRadius: 12, border: `2px solid ${C.acc3}60`, background: "transparent", color: C.acc3, fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>
            🎤 AIに相談する
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 40, justifyContent: "center", marginTop: 60 }}>
          {[["24", "AIエージェント"], ["4", "部門カバー"], ["80%", "業務削減"], ["3分", "導入時間"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: C.acc }}>{n}</div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product, onChat, delay = 0 }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.card2 : C.card, borderRadius: 16,
        border: `1px solid ${hov ? product.color + "50" : C.border}`,
        padding: 28, transition: "all .3s", position: "relative", overflow: "hidden",
        animation: `fadeUp .6s ease ${delay}s both`,
        transform: hov ? "translateY(-4px)" : "none",
        boxShadow: hov ? `0 8px 30px ${product.color}15` : "none",
      }}
    >
      {hov && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${product.color}, transparent)` }} />}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${product.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{product.icon}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{product.name}</div>
          <div style={{ fontSize: 12, color: product.color, fontWeight: 600 }}>{product.price}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, marginBottom: 16 }}>{product.tagline}</p>

      {/* Agents */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
        {product.agents.map(a => (
          <span key={a} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: `${product.color}12`, color: product.color, fontWeight: 500 }}>{a}</span>
        ))}
      </div>

      {/* Features */}
      <div style={{ marginBottom: 16 }}>
        {product.features.slice(0, 4).map(f => (
          <div key={f} style={{ fontSize: 12, color: C.sub, marginBottom: 4, paddingLeft: 14, position: "relative" }}>
            <span style={{ position: "absolute", left: 0, color: product.color }}>✓</span>{f}
          </div>
        ))}
      </div>

      {/* Results */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {product.results.map(r => (
          <span key={r} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 6, background: `${C.green}12`, color: C.green, fontWeight: 600 }}>{r}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onChat(product)} style={{
          flex: 1, padding: "10px", borderRadius: 8, border: "none",
          background: product.color, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>🎤 詳しく聞く</button>
        <button style={{
          padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
          background: "transparent", color: C.sub, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>無料デモ</button>
      </div>
    </div>
  );
}

/* ═══ SALES CHAT + TTS ═══ */
function SalesChat({ initialProduct, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const chatRef = useRef();
  const recognitionRef = useRef(null);

  // Initialize with greeting
  useEffect(() => {
    const greeting = initialProduct
      ? `こんにちは！営業AIアシスタントの「アイ」です。「${initialProduct.name}」に興味をお持ちいただきありがとうございます！こちらは${initialProduct.tagline.slice(0, 30)}ができるソリューションです。どのような課題をお持ちですか？`
      : `こんにちは！営業AIアシスタントの「アイ」です。CrewAI Agent Suiteに興味をお持ちいただきありがとうございます！経理・総務・法務・秘書の4部門をAIで自動化できます。どのような業務にお困りですか？`;
    setMessages([{ role: "assistant", content: greeting }]);
    if (ttsEnabled) setTimeout(() => { speak(greeting, () => setSpeaking(false)); setSpeaking(true); }, 500);
  }, []);

  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [messages]);

  // Speech Recognition
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeak();
    const rec = new SR();
    rec.lang = "ja-JP"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      setListening(false);
      // Auto-send
      setTimeout(() => sendMessage(text), 300);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
    recognitionRef.current = rec;
  };

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", content: msg }];
    setMessages(newMsgs);
    setBusy(true);

    try {
      const aiMsgs = newMsgs.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const reply = await callAI(aiMsgs);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      if (ttsEnabled) { speak(reply, () => setSpeaking(false)); setSpeaking(true); }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "申し訳ありません、一時的にエラーが発生しました。もう一度お試しください。" }]);
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", animation: "fadeIn .3s",
    }}>
      <div style={{
        width: "min(480px, 95vw)", height: "min(680px, 90vh)", borderRadius: 20,
        background: C.bg2, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${C.acc3}10`, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.acc3}, ${C.acc2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎙</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>営業AI「アイ」</div>
            <div style={{ fontSize: 10, color: speaking ? C.acc3 : C.green, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: speaking ? C.acc3 : C.green, animation: speaking ? "pulse 1s infinite" : "none" }} />
              {speaking ? "話し中..." : "オンライン"}
            </div>
          </div>
          <button onClick={() => setTtsEnabled(!ttsEnabled)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: ttsEnabled ? C.acc : C.dim, fontSize: 10, cursor: "pointer" }}>
            {ttsEnabled ? "🔊 音声ON" : "🔇 音声OFF"}
          </button>
          <button onClick={() => { stopSpeak(); onClose(); }} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: `${C.dim}40`, color: C.muted, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Messages */}
        <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10, animation: "fadeIn .3s" }}>
              {m.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.acc3}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 6, flexShrink: 0, marginTop: 2 }}>🎙</div>}
              <div style={{
                maxWidth: "80%", padding: "10px 14px", borderRadius: 14,
                background: m.role === "user" ? `${C.acc}20` : C.card,
                border: `1px solid ${m.role === "user" ? `${C.acc}30` : C.border}`,
                fontSize: 13, color: C.text, lineHeight: 1.8,
                borderBottomRightRadius: m.role === "user" ? 4 : 14,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 14,
              }}>{m.content}</div>
            </div>
          ))}
          {busy && <div style={{ display: "flex", gap: 6, padding: "8px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.acc3}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎙</div>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, color: C.acc3, fontSize: 12 }}>考え中...</div>
          </div>}
        </div>

        {/* Input */}
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={startListening} disabled={listening || busy} style={{
            width: 42, height: 42, borderRadius: "50%", border: "none", flexShrink: 0,
            background: listening ? `linear-gradient(135deg, ${C.red}, ${C.acc3})` : `linear-gradient(135deg, ${C.acc3}, ${C.acc2})`,
            color: "#fff", fontSize: 18, cursor: "pointer",
            boxShadow: listening ? `0 0 20px ${C.red}50` : `0 0 15px ${C.acc3}30`,
            animation: listening ? "pulse 1s infinite" : "none",
          }}>🎤</button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !busy && sendMessage()}
            placeholder={listening ? "聞いています..." : "メッセージを入力..."}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => sendMessage()} disabled={busy || !input.trim()} style={{
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: busy || !input.trim() ? C.dim : C.acc, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>送信</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatProduct, setChatProduct] = useState(null);
  const productsRef = useRef();

  const openChat = (product = null) => { stopSpeak(); setChatProduct(product); setChatOpen(true); };
  const closeChat = () => { stopSpeak(); setChatOpen(false); setChatProduct(null); };

  // Load voices
  useEffect(() => { window.speechSynthesis?.getVoices(); }, []);

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Helvetica Neue', sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "12px 24px", background: `${C.bg}dd`, backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}40`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${C.acc}, ${C.acc2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>AI</div>
          <span style={{ fontSize: 15, fontWeight: 800, background: `linear-gradient(90deg, ${C.acc}, ${C.acc2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CrewAI Suite</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => productsRef.current?.scrollIntoView({ behavior: "smooth" })} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "transparent", color: C.sub, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>プロダクト</button>
          <button onClick={() => openChat()} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: C.acc3, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🎤 AIに相談</button>
        </div>
      </nav>

      {/* HERO */}
      <HeroSection onScroll={() => productsRef.current?.scrollIntoView({ behavior: "smooth" })} onChat={() => openChat()} />

      {/* ARCHITECTURE */}
      <section style={{ padding: "80px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          <span style={{ color: C.acc }}>CrewAI</span> アーキテクチャ
        </h2>
        <p style={{ color: C.sub, fontSize: 14, marginBottom: 40 }}>社長の指示ひとつで、4部門24体のAIが連携</p>

        <div style={{ maxWidth: 700, margin: "0 auto", padding: 24, borderRadius: 16, background: C.card, border: `1px solid ${C.border}` }}>
          {/* CEO */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 10, background: `${C.acc}15`, border: `1px solid ${C.acc}40` }}>
              <span style={{ fontSize: 20 }}>👔</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.acc }}>社長（あなた）</span>
            </div>
            <div style={{ width: 2, height: 20, background: C.acc, margin: "0 auto", opacity: 0.4 }} />
          </div>

          {/* Orchestrator */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 8, background: `linear-gradient(135deg, ${C.acc}20, ${C.acc2}20)`, border: `1px solid ${C.acc}30` }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>CrewAI Orchestrator</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
              <div style={{ width: 200, height: 2, background: `linear-gradient(90deg, ${C.fin}, ${C.ga}, ${C.legal}, ${C.sec})`, opacity: 0.5 }} />
            </div>
          </div>

          {/* Departments */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {DEPTS.map(d => (
              <div key={d.id} style={{ padding: "12px 8px", borderRadius: 10, background: `${d.color}08`, border: `1px solid ${d.color}25` }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{d.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.color, marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.text }}>6</div>
                <div style={{ fontSize: 9, color: C.muted }}>エージェント</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section ref={productsRef} style={{ padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>プロダクト</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>あなたの課題に合わせて選べる4つのソリューション</p>
        </div>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.id} product={p} delay={i * 0.1} onChat={(prod) => openChat(prod)} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 30px", borderRadius: 20, background: `linear-gradient(135deg, ${C.acc}08, ${C.acc2}08, ${C.acc3}08)`, border: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>まずはAIに相談してみませんか？</h2>
          <p style={{ color: C.sub, fontSize: 14, marginBottom: 24, lineHeight: 1.8 }}>営業AI「アイ」が、あなたの会社に最適なプランを<br />音声でご提案します。</p>
          <button onClick={() => openChat()} style={{
            padding: "16px 48px", borderRadius: 14, border: "none",
            background: `linear-gradient(135deg, ${C.acc3}, ${C.acc2})`,
            color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer",
            boxShadow: `0 4px 30px ${C.acc3}40`, transition: "all .2s",
          }}>
            🎤 営業AIと話す
          </button>
          <div style={{ marginTop: 16, fontSize: 11, color: C.muted }}>音声対話 & テキストチャット対応 ・ 無料 ・ 所要時間3分</div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "30px 24px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.dim }}>© 2026 CrewAI Agent Suite. All rights reserved.</div>
      </footer>

      {/* Floating Chat Button */}
      {!chatOpen && (
        <button onClick={() => openChat()} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 90,
          width: 60, height: 60, borderRadius: "50%", border: "none",
          background: `linear-gradient(135deg, ${C.acc3}, ${C.acc2})`,
          color: "#fff", fontSize: 24, cursor: "pointer",
          boxShadow: `0 4px 20px ${C.acc3}50`, animation: "float 3s ease infinite",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>🎙</button>
      )}

      {/* Chat Modal */}
      {chatOpen && <SalesChat initialProduct={chatProduct} onClose={closeChat} />}
    </div>
  );
}
