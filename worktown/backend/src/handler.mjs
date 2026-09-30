// Lambda Function URL（InvokeMode: RESPONSE_STREAM）のエントリポイント。
// `awslambda` は Node.js ランタイムが提供するグローバル。
import { route } from "./app.mjs";

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  let stream = responseStream;
  const out = {
    start(statusCode, headers) {
      stream = awslambda.HttpResponseStream.from(responseStream, { statusCode, headers });
    },
    write(chunk) {
      stream.write(chunk);
    },
    end() {
      stream.end();
    },
  };
  try {
    await route(event, out);
  } catch (e) {
    console.error("unhandled", e);
    try {
      out.start(500, { "content-type": "application/json" });
      out.write(JSON.stringify({ error: "internal error" }));
      out.end();
    } catch {
      // 既にレスポンスを書き始めていた場合は何もできない
    }
  }
});
