// ローカル確認用サーバ: web/ を配信し、/api/* を Lambda と同じ route() に渡す。
//   node scripts/dev-server.mjs            … AWS 認証情報があれば Bedrock を実際に呼ぶ
//   MOCK=1 node scripts/dev-server.mjs     … AWS なしでデザイン確認（ダミー応答）
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../web/", import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const route = process.env.MOCK ? mockRoute : (await import("../backend/src/app.mjs")).route;

async function mockRoute(event, out) {
  if (event.rawPath !== "/api/experience") {
    out.start(200, { "content-type": "application/json" });
    out.write(JSON.stringify({ ok: true }));
    return out.end();
  }
  const { pavilion, mission } = JSON.parse(event.body);
  const result = {
    crew_log: [
      { agent: "受付係", action: "入力内容を整理", output: "（モック）入力を5件の明細に分解しました。" },
      { agent: "担当係", action: "成果物を作成", output: "（モック）表形式で成果物を作成しました。" },
      { agent: "チェック係", action: "内容を確認", output: "（モック）要確認事項を2件見つけました。" },
    ],
    deliverable: `## モック成果物\n\n${pavilion}/${mission} の体験画面確認用のダミーです。\n\n| 項目 | 内容 |\n|---|---|\n| 状態 | MOCK=1 で起動中 |\n| 実際の応答 | AWS 認証情報を設定して MOCK なしで起動 |\n\n- 箇条書き1\n- **太字** の確認`,
    review_points: ["これはモック応答です", "最終判断は人が行います"],
    impact: { ai_minutes: 5, note: "（モック）手作業に比べて大幅に短縮できます。" },
    next_step: "（モック）実データで PoC を行いましょう。",
  };
  out.start(200, { "content-type": "application/x-ndjson" });
  const text = JSON.stringify(result);
  for (let i = 0; i < text.length; i += 40) {
    out.write(JSON.stringify({ type: "delta", text: text.slice(i, i + 40) }) + "\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  out.write(JSON.stringify({ type: "done", result }) + "\n");
  out.end();
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const event = {
        rawPath: url.pathname,
        headers: req.headers,
        body,
        requestContext: { http: { method: req.method, sourceIp: req.socket.remoteAddress } },
      };
      const out = {
        start: (status, headers) => res.writeHead(status, headers),
        write: (chunk) => res.write(chunk),
        end: () => res.end(),
      };
      return route(event, out);
    }
    const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
    if (rel.includes("..")) return res.writeHead(400).end();
    try {
      const data = await readFile(join(WEB, rel));
      res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, () => console.log(`AI WORK TOWN: http://localhost:${PORT}${process.env.MOCK ? " (MOCK)" : ""}`));
