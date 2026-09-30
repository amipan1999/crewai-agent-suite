import {
  DynamoDBClient,
  UpdateItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const TABLE = process.env.TABLE_NAME;
const TOPIC = process.env.LEADS_TOPIC_ARN;
const ddb = TABLE ? new DynamoDBClient({}) : null;
const sns = TOPIC ? new SNSClient({}) : null;

const today = () => new Date().toISOString().slice(0, 10);

async function increment(key, limit) {
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { pk: { S: key } },
        UpdateExpression: "ADD #c :one SET #t = if_not_exists(#t, :ttl)",
        ConditionExpression: "attribute_not_exists(#c) OR #c < :limit",
        ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":limit": { N: String(limit) },
          ":ttl": { N: String(Math.floor(Date.now() / 1000) + 2 * 86400) },
        },
      }),
    );
    return true;
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

// 1人あたり・街全体の1日の体験回数を制限する（Bedrock の利用料の上限ガード）
export async function consumeQuota(ip) {
  if (!ddb) return { ok: true };
  const day = today();
  const perIp = Number(process.env.DAILY_LIMIT_PER_IP || 15);
  const global = Number(process.env.DAILY_LIMIT_GLOBAL || 1000);
  if (!(await increment(`quota#ip#${ip}#${day}`, perIp))) {
    return { ok: false, reason: "ip" };
  }
  if (!(await increment(`quota#global#${day}`, global))) {
    return { ok: false, reason: "global" };
  }
  return { ok: true };
}

export async function saveLead(lead) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (!ddb) {
    console.log("[lead]", JSON.stringify({ id, createdAt, ...lead }));
    return id;
  }
  const item = { pk: { S: `lead#${createdAt}#${id}` }, createdAt: { S: createdAt } };
  for (const [k, v] of Object.entries(lead)) {
    if (Array.isArray(v)) {
      if (v.length) item[k] = { SS: v };
    } else if (v) {
      item[k] = { S: String(v) };
    }
  }
  await ddb.send(new PutItemCommand({ TableName: TABLE, Item: item }));

  if (sns) {
    await sns.send(
      new PublishCommand({
        TopicArn: TOPIC,
        Subject: `[AI WORK TOWN] ご相談: ${lead.company || lead.name}`.slice(0, 99),
        Message: [
          `会社名: ${lead.company || "-"}`,
          `お名前: ${lead.name}`,
          `メール: ${lead.email}`,
          `ご相談内容: ${lead.plan || "-"}`,
          `体験したパビリオン: ${(lead.visited || []).join(", ") || "-"}`,
          "",
          lead.message || "",
        ].join("\n"),
      }),
    );
  }
  return id;
}
