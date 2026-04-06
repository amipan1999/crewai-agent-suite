import { useState, useRef, useCallback } from "react";

const CATEGORY_COLORS = {
  "旅費交通費": "#2563eb",
  "交際費": "#dc2626",
  "消耗品費": "#16a34a",
  "通信費": "#9333ea",
  "会議費": "#ea580c",
  "新聞図書費": "#0891b2",
  "地代家賃": "#4f46e5",
  "水道光熱費": "#ca8a04",
  "広告宣伝費": "#e11d48",
  "雑費": "#6b7280",
  "福利厚生費": "#059669",
  "外注費": "#7c3aed",
  "租税公課": "#b91c1c",
  "修繕費": "#0d9488",
  "その他": "#94a3b8",
};

const SYSTEM_PROMPT = `あなたは経理AIエージェントです。領収書の画像を受け取り、以下のJSON形式で仕訳データを返してください。

必ず以下のJSON形式のみで回答してください。説明文やマークダウンは不要です。

{
  "date": "YYYY-MM-DD",
  "vendor": "店名・取引先名",
  "amount": 数値（税込合計）,
  "tax": 数値（消費税額、不明なら0）,
  "category": "勘定科目",
  "description": "摘要（何を購入したか簡潔に）",
  "payment_method": "現金/クレジットカード/電子マネー/その他"
}

勘定科目は以下から最適なものを選んでください：
旅費交通費, 交際費, 消耗品費, 通信費, 会議費, 新聞図書費, 地代家賃, 水道光熱費, 広告宣伝費, 雑費, 福利厚生費, 外注費, 租税公課, 修繕費

日付が読み取れない場合は今日の日付を使用してください。
金額が読み取れない場合は0としてください。
必ずJSONのみを返してください。`;

export default function ReceiptAgent() {
  const [entries, setEntries] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const fileInputRef = useRef(null);

  const processReceipt = useCallback(async (file) => {
    setProcessing(true);
    setError(null);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          setPreviewUrl(reader.result);
          resolve(reader.result.split(",")[1]);
        };
        reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
        reader.readAsDataURL(file);
      });

      const mediaType = file.type || "image/jpeg";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: base64 },
                },
                { type: "text", text: "この領収書を読み取って仕訳してください。" },
              ],
            },
          ],
          system: SYSTEM_PROMPT,
        }),
      });

      const data = await response.json();
      const text = data.content?.map((c) => c.text || "").join("") || "";
      const cleanText = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanText);

      const entry = {
        id: Date.now().toString(),
        ...parsed,
        timestamp: new Date().toISOString(),
        imageUrl: URL.createObjectURL(file),
      };

      setEntries((prev) => [entry, ...prev]);
    } catch (err) {
      console.error(err);
      setError("領収書の読み取りに失敗しました。もう一度お試しください。");
    } finally {
      setProcessing(false);
      setTimeout(() => setPreviewUrl(null), 2000);
    }
  }, []);

  const handleFile = (file) => {
    if (file && file.type.startsWith("image/")) {
      processReceipt(file);
    } else {
      setError("画像ファイルを選択してください");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditData({ ...entry });
  };

  const saveEdit = () => {
    setEntries((prev) =>
      prev.map((e) => (e.id === editingId ? { ...e, ...editData } : e))
    );
    setEditingId(null);
    setEditData({});
  };

  const deleteEntry = (id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const downloadCSV = () => {
    if (entries.length === 0) return;
    const headers = ["日付", "取引先", "金額", "消費税", "勘定科目", "摘要", "支払方法"];
    const rows = entries.map((e) => [
      e.date, e.vendor, e.amount, e.tax, e.category, e.description, e.payment_method,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `経費精算_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalAmount = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalTax = entries.reduce((sum, e) => sum + (Number(e.tax) || 0), 0);

  const categoryBreakdown = entries.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {});

  return (
    <div style={{
      fontFamily: "'Noto Sans JP', 'Helvetica Neue', sans-serif",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700, color: "#fff",
          }}>経</div>
          <h1 style={{
            fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em",
            background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>経理AIエージェント</h1>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 14, marginLeft: 52 }}>
          領収書を撮影・アップロードするだけで自動仕訳
        </p>
      </div>

      {/* Upload Area */}
      <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "#3b82f6" : "#334155"}`,
            borderRadius: 16,
            padding: processing ? "24px" : "48px 24px",
            textAlign: "center",
            cursor: processing ? "default" : "pointer",
            background: dragOver ? "rgba(59,130,246,0.08)" : "rgba(30,41,59,0.5)",
            backdropFilter: "blur(8px)",
            transition: "all 0.3s ease",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {processing && (
            <div style={{
              position: "absolute", left: 0, width: "100%", height: 2,
              background: "linear-gradient(90deg, transparent, #3b82f6, transparent)",
              animation: "scan 1.5s ease-in-out infinite",
            }} />
          )}

          {previewUrl && processing ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <img src={previewUrl} alt="領収書" style={{
                maxHeight: 120, borderRadius: 8, opacity: 0.7,
                animation: "pulse 2s infinite",
              }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#60a5fa", marginBottom: 6 }}>
                  読み取り中...
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  AIが領収書を解析しています
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#cbd5e1", marginBottom: 6 }}>
                領収書の画像をドラッグ&ドロップ
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                またはクリックしてファイルを選択
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            style={{ display: "none" }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: "10px 16px", borderRadius: 8,
            background: "rgba(239,68,68,0.15)", color: "#fca5a5",
            fontSize: 13, border: "1px solid rgba(239,68,68,0.3)",
          }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {entries.length > 0 && (
        <div style={{
          maxWidth: 900, margin: "0 auto 24px",
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12,
        }}>
          <div style={{
            background: "rgba(30,41,59,0.7)", borderRadius: 12, padding: "16px 20px",
            border: "1px solid #1e293b",
          }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>合計金額</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#60a5fa" }}>
              ¥{totalAmount.toLocaleString()}
            </div>
          </div>
          <div style={{
            background: "rgba(30,41,59,0.7)", borderRadius: 12, padding: "16px 20px",
            border: "1px solid #1e293b",
          }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>消費税合計</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#a78bfa" }}>
              ¥{totalTax.toLocaleString()}
            </div>
          </div>
          <div style={{
            background: "rgba(30,41,59,0.7)", borderRadius: 12, padding: "16px 20px",
            border: "1px solid #1e293b",
          }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>登録件数</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#34d399" }}>
              {entries.length}件
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <div style={{
          maxWidth: 900, margin: "0 auto 24px",
          background: "rgba(30,41,59,0.7)", borderRadius: 12, padding: 20,
          border: "1px solid #1e293b",
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8", marginBottom: 12 }}>勘定科目別内訳</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(15,23,42,0.6)", borderRadius: 8, padding: "6px 12px",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: CATEGORY_COLORS[cat] || "#94a3b8",
                }} />
                <span style={{ fontSize: 13, color: "#cbd5e1" }}>{cat}</span>
                <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>
                  ¥{amt.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry List */}
      {entries.length > 0 && (
        <div style={{ maxWidth: 900, margin: "0 auto 24px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8" }}>仕訳一覧</span>
            <button onClick={downloadCSV} style={{
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 20px", fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "transform 0.15s",
            }}
              onMouseEnter={(e) => e.target.style.transform = "scale(1.03)"}
              onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
            >
              📥 CSVダウンロード
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((entry, i) => (
              <div key={entry.id} style={{
                background: "rgba(30,41,59,0.7)", borderRadius: 12,
                border: "1px solid #1e293b", overflow: "hidden",
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}>
                {editingId === entry.id ? (
                  /* Edit Mode */
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "日付", key: "date", type: "date" },
                        { label: "取引先", key: "vendor" },
                        { label: "金額", key: "amount", type: "number" },
                        { label: "消費税", key: "tax", type: "number" },
                        { label: "摘要", key: "description" },
                        { label: "支払方法", key: "payment_method" },
                      ].map(({ label, key, type }) => (
                        <div key={key}>
                          <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>{label}</label>
                          <input
                            type={type || "text"}
                            value={editData[key] || ""}
                            onChange={(e) => setEditData((d) => ({ ...d, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                            style={{
                              width: "100%", padding: "6px 10px", borderRadius: 6,
                              border: "1px solid #334155", background: "#0f172a",
                              color: "#e2e8f0", fontSize: 13, outline: "none",
                            }}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>勘定科目</label>
                        <select
                          value={editData.category || ""}
                          onChange={(e) => setEditData((d) => ({ ...d, category: e.target.value }))}
                          style={{
                            width: "100%", padding: "6px 10px", borderRadius: 6,
                            border: "1px solid #334155", background: "#0f172a",
                            color: "#e2e8f0", fontSize: 13, outline: "none",
                          }}
                        >
                          {Object.keys(CATEGORY_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setEditingId(null)} style={{
                        padding: "6px 14px", borderRadius: 6, border: "1px solid #334155",
                        background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer",
                      }}>キャンセル</button>
                      <button onClick={saveEdit} style={{
                        padding: "6px 14px", borderRadius: 6, border: "none",
                        background: "#3b82f6", color: "#fff", fontSize: 12, cursor: "pointer",
                      }}>保存</button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 14 }}>
                    {entry.imageUrl && (
                      <img src={entry.imageUrl} alt="" style={{
                        width: 44, height: 44, borderRadius: 8, objectFit: "cover",
                        border: "1px solid #334155", flexShrink: 0,
                      }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0" }}>{entry.vendor}</span>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 4,
                          background: `${CATEGORY_COLORS[entry.category] || "#94a3b8"}22`,
                          color: CATEGORY_COLORS[entry.category] || "#94a3b8",
                          fontWeight: 500,
                        }}>{entry.category}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {entry.date} ・ {entry.description} ・ {entry.payment_method}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 600,
                        fontFamily: "'JetBrains Mono', monospace", color: "#f1f5f9",
                      }}>¥{Number(entry.amount).toLocaleString()}</div>
                      {entry.tax > 0 && (
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          (税 ¥{Number(entry.tax).toLocaleString()})
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => startEdit(entry)} style={{
                        width: 30, height: 30, borderRadius: 6, border: "none",
                        background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                        cursor: "pointer", fontSize: 13, display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>✏️</button>
                      <button onClick={() => deleteEntry(entry.id)} style={{
                        width: 30, height: 30, borderRadius: 6, border: "none",
                        background: "rgba(239,68,68,0.15)", color: "#f87171",
                        cursor: "pointer", fontSize: 13, display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {entries.length === 0 && !processing && (
        <div style={{
          maxWidth: 900, margin: "0 auto", textAlign: "center",
          padding: "40px 20px", color: "#475569",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>まだ領収書が登録されていません</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>上のエリアに領収書の画像をドロップしてください</div>
        </div>
      )}
    </div>
  );
}
