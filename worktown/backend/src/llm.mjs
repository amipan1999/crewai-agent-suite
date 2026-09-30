import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

const MODEL_ID = process.env.MODEL_ID || "anthropic.claude-opus-5-5";
const EFFORT = process.env.MODEL_EFFORT || "low";

const client = new AnthropicBedrockMantle({
  awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION,
});

// 画面の「AIチームの作業ログ」「成果物」「インパクト」をそのまま描画できる形で返させる
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    crew_log: {
      type: "array",
      items: {
        type: "object",
        properties: {
          agent: { type: "string" },
          action: { type: "string" },
          output: { type: "string" },
        },
        required: ["agent", "action", "output"],
        additionalProperties: false,
      },
    },
    deliverable: { type: "string" },
    review_points: { type: "array", items: { type: "string" } },
    impact: {
      type: "object",
      properties: {
        ai_minutes: { type: "integer" },
        note: { type: "string" },
      },
      required: ["ai_minutes", "note"],
      additionalProperties: false,
    },
    next_step: { type: "string" },
  },
  required: ["crew_log", "deliverable", "review_points", "impact", "next_step"],
  additionalProperties: false,
};

function systemPrompt(pavilion, mission) {
  const crew = mission.crew.map((c) => `- ${c.name}：${c.role}`).join("\n");
  return `あなたは体験型施設「AI WORK TOWN」の「${pavilion.name}」で働くAIエージェントチームです。
来場者は「${pavilion.role}」役として、あなたたちAI部下に仕事を依頼します。これは、AIエージェントが実務をどう分担してこなすかを見せるデモです。

# チーム構成（この順に作業する）
${crew}

# 今回のミッション：${mission.title}
${mission.focus}

# 出力のルール
- crew_log：上のメンバーが順番に行った作業を1人1件以上、具体的に記録する（action は何をしたか、output はその結果の要点を2〜3文で）。
- deliverable：上司がそのまま使える成果物を Markdown で書く。見出し・表・箇条書きを使い、日本語のビジネス文書として完成度を高くする。
- review_points：上司（人間）が最終確認すべき点を3〜5個。AIに任せきりにせず人が判断すべき箇所を明示する。
- impact.ai_minutes：同じ作業をAIチーム＋人の確認で行った場合の想定所要時間（分）。impact.note は効果を1〜2文で。
- next_step：この業務を実際の会社で自動化する場合の次の一歩を1〜2文で。
- 入力にない事実は作らない。仮定を置く場合は「仮定」と明記する。
- 法務・税務・労務の内容は一般的な情報として示し、最終判断は専門家の確認が必要である旨を review_points に含める。
- 入力がこのミッションと無関係、または不適切な場合は、deliverable でミッションに沿った入力例を案内する。`;
}

// onText には生成中の JSON テキスト断片が順に渡される（画面の進捗表示用）
export async function runMission(pavilion, mission, userInput, onText) {
  const stream = client.messages.stream({
    model: MODEL_ID,
    max_tokens: 12000,
    system: systemPrompt(pavilion, mission),
    messages: [{ role: "user", content: userInput }],
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onText?.(event.delta.text);
    }
  }
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    const err = new Error("refusal");
    err.code = "REFUSAL";
    throw err;
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error("max_tokens");
    err.code = "TRUNCATED";
    throw err;
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    ...JSON.parse(text),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
