# AIエージェント詳細仕様

## バージョン履歴

### v0.1 - 領収書処理プロトタイプ
- `agents/finance/receipt-agent.jsx`
- 領収書画像アップロード→AI自動仕訳→CSV出力

### v0.2 - 経理AI Suite
- `agents/finance/accounting-suite.jsx`
- 6エージェント統合: 領収書・発注書・請求書・入出金・経費・月次レポート
- Storage API永続化対応

### v0.3 - 総務・法務AI Suite
- `agents/ga-legal/ga-legal-suite.jsx`
- 6エージェント: 契約書・社内規程・備品・勤怠・届出書類・法務相談
- 契約書AIレビュー機能（リスクスコア付き）

### v0.4 - CrewAI Orchestrator v1
- `agents/orchestrator/crewai-orchestrator-v1.jsx`
- 3部門18エージェント統合
- 自然言語コマンド→自動ルーティング→実行→社長報告

### v0.5 - 秘書AI Agent
- `agents/secretary/secretary-agent.jsx`
- Gmail MCP / Google Calendar MCP連携
- メール→予定抽出→カレンダー自動登録

### v0.6 - CrewAI Orchestrator v2
- `agents/orchestrator/crewai-orchestrator-v2.jsx`
- 4部門24エージェント統合（秘書室追加）
- Gmail/GCal MCP連携をオーケストレーターに統合

### v0.7 - 営業サイト + 営業AIチャットボット
- `site/index.html`
- LP（ヒーロー・アーキテクチャ図・プロダクトカード・CTA）
- 営業AI「アイ」チャットボット（ベテラン営業マン風）
- Speech-to-Text / Chat-to-Speech対応
- TTS 3エンジン切替（ブラウザ / ElevenLabs / OpenAI TTS）

## API依存関係

| サービス | 用途 | 必須/任意 |
|---|---|---|
| Claude API (Anthropic) | 全エージェントのAI処理 | 必須 |
| Gmail MCP | メール取得・解析 | 秘書室で必須 |
| Google Calendar MCP | 予定取得・登録 | 秘書室で必須 |
| ElevenLabs API | 高品質TTS | 任意 |
| OpenAI TTS API | TTS代替 | 任意 |
