# AI WORK TOWN — AIと働く職業体験パーク

> 上司になるのは、あなた。部下は、AIエージェント。

「大人のキッザニア」をテーマにした、AIエージェント業務体験サイト＋AIコンサルティング受付サイトです。
来場者は各パビリオンで「上司」役になり、AIエージェントのチーム（受付係・担当係・チェック係…）に
実務を任せる体験をします。最後に「出国ゲート」でAI導入診断を受け、コンサルティングの相談につなげます。

CrewAI Agent Suite（`agents/`）の考え方である「部署ごとのエージェントチーム＋オーケストレーター」を、
AWS 上で誰でも触れるデモとして公開するためのものです。

## 街の構成

| パビリオン | 役職 | ミッション |
|---|---|---|
| 💰 AI経理部 | 経理課長 | 領収書の仕訳 / 社長向け月次レポート |
| ⚖️ AI法務部 | 法務マネージャー | 契約書リスクチェック / NDAドラフト |
| 💼 AI秘書室 | 社長 | メールから予定抽出 / 会議準備 |
| 🚀 AI営業部 | 営業部長 | 提案書の骨子 / 停滞商談の立て直し |
| 🤝 AI人事部 | 人事責任者 | 求人票づくり / オンボーディング計画 |
| 👑 AI社長室 | 社長 | ひと言の指示を全部署のタスクに分解（オーケストレーター） |
| 🧳 出国ゲート | 経営者 | AI導入診断（ロードマップ作成）→ 相談フォームへ |

体験するとパスポートにスタンプが押されます（ブラウザの localStorage に保存）。
相談フォームには、体験したパビリオンが自動で添えられます。

## アーキテクチャ

```
ブラウザ
  │
  ▼
Amazon CloudFront ──(/*)──────▶ Amazon S3（web/：静的サイト、OAC で非公開）
  │
  └──(/api/*)──▶ Lambda Function URL（Node.js 22, レスポンスストリーミング）
                   ├─▶ Amazon Bedrock（Claude / Messages API）… AIチームの推論
                   ├─▶ Amazon DynamoDB … 1日あたりの利用回数制限・相談の保存
                   └─▶ Amazon SNS（任意）… 相談をメール通知
```

- **ストリーミング**：AIの生成を NDJSON で逐次返し、画面の「AIチーム」が作業中→完了と進む様子を表示します。
  CloudFront のオリジン待ち時間（60秒）を超える長い生成でも途切れません。
- **構造化出力**：モデルの出力は JSON スキーマ（作業ログ・成果物・上司チェックポイント・削減時間）で固定し、そのまま画面に描画します。
- **プロンプトはサーバ側だけ**：各ミッションの指示文（`focus`）は Lambda 内にあり、ブラウザには公開しません。
- **コストのガード**：IP ごと・街全体の1日の体験回数（既定 15回 / 1,000回）、入力 3,000 文字まで。
- **直アクセス防止**：Function URL は CloudFront が付ける `X-Origin-Verify` ヘッダーがないと 403 を返します。

## ディレクトリ

```
worktown/
├── template.yaml              # AWS SAM（S3 / CloudFront / Lambda / DynamoDB / SNS）
├── backend/
│   ├── package.json
│   └── src/
│       ├── pavilions.mjs      # パビリオン・ミッション定義（唯一の定義元）
│       ├── llm.mjs            # Bedrock 呼び出し（ストリーミング＋JSONスキーマ）
│       ├── app.mjs            # ルーティング（/api/experience, /api/contact, /api/health）
│       ├── store.mjs          # DynamoDB（利用制限・相談）と SNS 通知
│       └── handler.mjs        # Lambda エントリ（streamifyResponse）
├── web/
│   ├── index.html             # トップ：街マップ・AWS構成・コンサル・料金・FAQ・相談フォーム
│   ├── pavilion.html          # 体験ページ（?p=finance&m=journal）
│   ├── css/town.css
│   ├── js/{common,home,pavilion}.js
│   └── data/pavilions.js      # 自動生成（公開用のミッション情報）
└── scripts/
    ├── build-web-data.mjs     # pavilions.mjs → web/data/pavilions.js
    ├── dev-server.mjs         # ローカル確認用サーバ
    └── deploy.sh              # ビルド〜デプロイ〜S3アップロードまで一括
```

## デプロイ手順

### 事前準備

1. AWS CLI v2・[AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)・Node.js 20 以上をインストール
2. Amazon Bedrock のコンソールで、利用するリージョンの Claude モデルへのアクセスを有効化
3. デプロイする IAM ユーザー／ロールで `aws configure`（または SSO ログイン）

### デプロイ

```bash
cd worktown
NOTIFY_EMAIL=you@example.com ./scripts/deploy.sh
```

完了すると `✅ 開園しました: https://xxxx.cloudfront.net` と表示されます。
`NOTIFY_EMAIL` を指定した場合は、AWS から届く確認メールのリンクを開くと相談の通知が届くようになります。

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `STACK` | `ai-work-town` | CloudFormation スタック名 |
| `AWS_REGION` | `ap-northeast-1` | デプロイ先リージョン |
| `MODEL_ID` | `anthropic.claude-sonnet-5-5` | Bedrock のモデルID |
| `NOTIFY_EMAIL` | （なし） | 相談の通知先メールアドレス |

利用回数の上限や推論の深さ（`ModelEffort`、既定 `low`）は `template.yaml` の Parameters で変更できます。
Bedrock を別リージョンで呼ぶ場合は `BedrockRegion` を指定してください。

### 相談（リード）の確認

相談は DynamoDB テーブル（出力 `LeadsTable`）に `pk = lead#<日時>#<ID>` で保存されます。

```bash
aws dynamodb scan --table-name <LeadsTable> \
  --filter-expression "begins_with(pk, :p)" \
  --expression-attribute-values '{":p":{"S":"lead#"}}'
```

### 独自ドメイン

CloudFront に ACM 証明書（us-east-1）と代替ドメイン名を設定し、Route 53 で ALIAS レコードを向けてください。

## ローカルで確認する

```bash
cd worktown
node scripts/build-web-data.mjs
cd backend && npm install && cd ..

MOCK=1 node scripts/dev-server.mjs          # AWS なし：ダミー応答で画面を確認
AWS_REGION=us-east-1 node scripts/dev-server.mjs   # AWS 認証情報あり：Bedrock を実際に呼ぶ
# → http://localhost:8080
```

ローカルでは DynamoDB を使わず（`TABLE_NAME` 未設定）、相談はコンソールにログ出力されます。

## パビリオン・ミッションを追加する

1. `backend/src/pavilions.mjs` にパビリオンまたはミッションを追加
   - `focus`：AIチームへの具体的な指示（サーバ側のみ）
   - `crew`：画面に表示するAIメンバー（3名前後）
   - `manualMinutes`：人だけで行った場合の想定時間（削減率の計算に使用）
2. `./scripts/deploy.sh` を実行（`web/data/pavilions.js` も自動で再生成されます）

顧客向けの「社内版 AI WORK TOWN」を作る場合も、このファイルに自社業務のミッションを足すだけで対応できます。

## 料金の目安（AWS）

- Bedrock：体験1回あたり入力 約1〜2千トークン＋出力 約2〜4千トークン（モデルの料金表をご確認ください）
- Lambda / CloudFront / S3 / DynamoDB：小規模なデモであれば無料枠〜数百円/月程度

上限は `DailyLimitGlobal`（既定 1日 1,000 回）で制御できます。
