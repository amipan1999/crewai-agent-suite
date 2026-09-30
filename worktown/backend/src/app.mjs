// ルーティングと業務ロジック。Lambda（handler.mjs）とローカル開発サーバ
// （scripts/dev-server.mjs）の両方から、同じ `out` インターフェースで呼ばれる:
//   out.start(statusCode, headers) → out.write(string) → out.end()
import { findMission } from "./pavilions.mjs";
import { runMission } from "./llm.mjs";
import { consumeQuota, saveLead } from "./store.mjs";

const MAX_INPUT = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEARTBEAT_MS = 10_000;

function sendJson(out, statusCode, body) {
  out.start(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  out.write(JSON.stringify(body));
  out.end();
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// CloudFront は X-Forwarded-For に閲覧者の IP を載せて転送する
function viewerIp(event) {
  const xff = event.headers?.["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return event.requestContext?.http?.sourceIp || "unknown";
}

// 体験 API は NDJSON でストリーミングする:
//   {"type":"delta","text":"..."} … 生成中の断片
//   {"type":"ping"}               … 無通信タイムアウト防止
//   {"type":"done","result":{…}}  または {"type":"error","error":"…"}
async function experience(event, out) {
  const body = parseBody(event);
  if (!body) return sendJson(out, 400, { error: "リクエストの形式が正しくありません。" });

  const found = findMission(body.pavilion, body.mission);
  if (!found) return sendJson(out, 404, { error: "そのパビリオン・ミッションは見つかりません。" });

  const input = String(body.input ?? "").trim();
  if (!input) return sendJson(out, 400, { error: "指示内容を入力してください。" });
  if (input.length > MAX_INPUT) {
    return sendJson(out, 400, { error: `指示は${MAX_INPUT}文字以内でお願いします。` });
  }

  const quota = await consumeQuota(viewerIp(event));
  if (!quota.ok) {
    return sendJson(out, 429, {
      error:
        quota.reason === "ip"
          ? "本日の体験回数の上限に達しました。明日またご来場ください。"
          : "本日は大変混み合っており、体験の受付を終了しました。",
    });
  }

  out.start(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
  });
  const emit = (obj) => out.write(JSON.stringify(obj) + "\n");
  const heartbeat = setInterval(() => emit({ type: "ping" }), HEARTBEAT_MS);
  emit({ type: "ping" });

  try {
    const result = await runMission(found.pavilion, found.mission, input, (text) =>
      emit({ type: "delta", text }),
    );
    emit({ type: "done", result });
  } catch (e) {
    let error = "AIチームが応答しませんでした。少し時間をおいてお試しください。";
    if (e.code === "REFUSAL") {
      error = "この内容ではAIチームが作業できませんでした。別の指示でお試しください。";
    } else if (e.code === "TRUNCATED") {
      error = "指示が大きすぎて作業が終わりませんでした。範囲を絞ってお試しください。";
    } else {
      console.error("mission failed", e);
    }
    emit({ type: "error", error });
  } finally {
    clearInterval(heartbeat);
    out.end();
  }
}

async function contact(event, out) {
  const body = parseBody(event);
  if (!body) return sendJson(out, 400, { error: "リクエストの形式が正しくありません。" });
  if (body.website) return sendJson(out, 200, { ok: true }); // ボット対策のハニーポット

  const s = (v, max) => String(v ?? "").trim().slice(0, max);
  const lead = {
    name: s(body.name, 100),
    company: s(body.company, 200),
    email: s(body.email, 200),
    plan: s(body.plan, 100),
    message: s(body.message, 4000),
    visited: Array.isArray(body.visited) ? body.visited.map((v) => s(v, 40)).slice(0, 20) : [],
  };
  if (!lead.name || !EMAIL_RE.test(lead.email)) {
    return sendJson(out, 400, { error: "お名前とメールアドレスを正しく入力してください。" });
  }
  await saveLead(lead);
  sendJson(out, 200, { ok: true });
}

export async function route(event, out) {
  const verify = process.env.ORIGIN_VERIFY;
  if (verify && event.headers?.["x-origin-verify"] !== verify) {
    return sendJson(out, 403, { error: "forbidden" });
  }

  const method = event.requestContext?.http?.method;
  const path = event.rawPath || "/";

  if (method === "GET" && path === "/api/health") return sendJson(out, 200, { ok: true });
  if (method === "POST" && path === "/api/experience") return experience(event, out);
  if (method === "POST" && path === "/api/contact") return contact(event, out);
  return sendJson(out, 404, { error: "not found" });
}
