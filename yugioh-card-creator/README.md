# Yu-Gi-Oh! カードクリエイター

オリジナルの遊戯王風カードを作成し、PNGとして書き出せるデスクトップアプリ（Electron + React + Tailwind CSS）。

## ディレクトリ構成

```
yugioh-card-creator/
├── electron/
│   ├── main.cjs          # Electron メインプロセス（PNG保存ダイアログ含む）
│   └── preload.cjs       # contextBridge で window.cardAPI を公開
├── src/
│   ├── main.jsx          # Reactエントリ
│   ├── App.jsx           # 2カラムレイアウト + PNGエクスポート
│   ├── constants.js      # 属性 / 種別 / デフォルトカード
│   ├── index.css         # Tailwind + カスタム
│   └── components/
│       ├── CardForm.jsx  # 左側: 入力フォーム（画像アップロード、スケール調整）
│       └── CardPreview.jsx # 右側: 遊戯王カード風プレビュー（ドラッグ&ホイール対応）
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## 開発

```bash
# 初回のみ（ネット接続のある環境で実行 — Electron バイナリのDLが必要）
npm install

# 開発起動（Vite + Electron を同時起動）
npm run dev

# Webブラウザだけで確認したい場合
npm run dev:vite        # http://localhost:5173

# 本番ビルド
npm run build
```

## 実装済み機能

- 入力フォーム（カード名 / 属性 / レベル(1〜12) / カード種別 / 種族 / 効果テキスト / ATK / DEF）
- リアルタイムプレビュー（カード種別ごとにフレーム色が変化）
- カードイラスト編集
  - ローカル画像アップロード（FileReader → DataURL）
  - スライダーで拡大縮小（0.3〜3.0倍）
  - **プレビュー上で画像をドラッグ**して位置調整
  - **マウスホイール**で拡大縮小
  - イラスト枠外は `overflow: hidden` でクリップ
- PNG保存（html-to-image で2倍解像度書き出し / Electron時はネイティブ保存ダイアログ）

## 既知の TODO（次のステップ候補）

- リンクモンスターのリンクマーカー描画
- ペンデュラムスケール（青/赤）の対応
- 効果テキストのルビ・改行強化
- カードのプリセット保存・呼び出し（localStorage）
- Electron Builder での dmg/exe パッケージング
