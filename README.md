# CrewAI Agent Suite

> 社長ひとりで、AI経営を始めよう

経理・総務・法務・秘書の4部門24体のAIエージェントを統合した、AI経営プラットフォーム。

## アーキテクチャ

```
👔 社長（人間）
    ↓ 自然言語で指示
🎯 CrewAI Orchestrator
    ↓ 自動ルーティング・実行
┌───────────┬───────────┬───────────┬──────────────┐
│ 💰 経理部  │ 🏛 総務部  │ ⚖️ 法務部 │ 💼 秘書室     │
│ 6 agents  │ 6 agents  │ 6 agents │ 6 agents     │
│           │           │          │ Gmail MCP    │
│           │           │          │ GCal MCP     │
└───────────┴───────────┴───────────┴──────────────┘
```

## ディレクトリ構成

```
crewai-agent-suite/
├── agents/
│   ├── finance/              # 経理部エージェント
│   │   ├── receipt-agent.jsx       # 領収書処理（初期プロトタイプ）
│   │   ├── accounting-dashboard.jsx # 経理ダッシュボード v1
│   │   └── accounting-suite.jsx     # 経理AI Suite（完成版）
│   ├── ga-legal/             # 総務・法務エージェント
│   │   └── ga-legal-suite.jsx       # 総務・法務AI Suite
│   ├── secretary/            # 秘書エージェント
│   │   └── secretary-agent.jsx      # 秘書AI（Gmail/GCal連携）
│   └── orchestrator/         # CrewAI オーケストレーター
│       ├── crewai-orchestrator-v1.jsx # v1（3部門18エージェント）
│       └── crewai-orchestrator-v2.jsx # v2（4部門24エージェント）
├── site/                     # 営業サイト
│   ├── index.html                   # LP + 営業AIチャットボット（Netlifyデプロイ用）
│   └── crewai-landing.jsx          # React版LP
├── docs/                     # ドキュメント
│   └── AGENTS.md                    # エージェント一覧
├── .gitignore
├── LICENSE
└── README.md
```

## エージェント一覧

### 💰 経理部（6体）
| エージェント | 機能 |
|---|---|
| 🧾 領収書処理 | 領収書画像→AI自動仕訳→CSV出力 |
| 📋 発注書作成 | 発注先・品目入力→AI発注書生成 |
| 📄 請求書作成 | 請求書AI生成・入金ステータス管理 |
| 💰 入出金管理 | 入出金記録・収支サマリー自動集計 |
| 🗂 経費精算 | 経費申請・承認/差戻しワークフロー |
| 📊 月次レポート | 全データ横断のAI月次分析 |

### 🏛 総務部（6体）
| エージェント | 機能 |
|---|---|
| 📝 契約書管理 | AIドラフト生成・レビュー（リスク判定） |
| 📖 社内規程 | 就業規則など10種類の規程AI生成 |
| 🖥 備品管理 | 備品台帳・カテゴリ管理・CSV出力 |
| ⏰ 勤怠管理 | 出退勤記録・残業計算・休暇申請 |
| 📋 届出書類 | 12種類の届出書類AI生成 |
| ⚖️ 法務相談 | 法務・コンプライアンスAIチャット |

### 💼 秘書室（6体）
| エージェント | 機能 |
|---|---|
| 📧 メール解析 | Gmail MCP連携・メール自動取得 |
| 🔍 予定抽出 | メールから予定をAI自動抽出 |
| 📅 カレンダー登録 | Google Calendar MCPで直接登録 |
| 🗓 スケジュール確認 | 今週の予定取得・表示 |
| 📑 会議準備 | アジェンダ自動作成 |
| ☀️ デイリーブリーフ | 毎朝の業務ブリーフィング |

## 技術スタック

- **フロントエンド**: React (JSX) / HTML / CSS
- **AI**: Claude API (Anthropic)
- **MCP連携**: Gmail MCP / Google Calendar MCP
- **TTS**: Web Speech API / ElevenLabs / OpenAI TTS
- **STT**: Web Speech Recognition API
- **永続化**: Claude Artifacts Storage API
- **デプロイ**: Netlify

## セットアップ

### サイト（LP + 営業AIチャットボット）
```bash
# site/index.html をそのままNetlifyにデプロイ
# ドラッグ&ドロップでOK
```

### エージェント
各 `.jsx` ファイルはClaude Artifactとして動作します。
Claude.ai上で直接実行可能です。

## ライセンス

MIT License
