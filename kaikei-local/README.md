# kaikei-local — 個人事業主向けローカル会計アプリ

自分のPCだけで動く、青色申告向けの小さな会計アプリです。領収書・請求書をアップロードして
AI（Claude）に読み取らせ、仕訳を作り、最後に **freee の仕訳帳CSVとまったく同じ形式** で書き出します。
クラウドにデータは置きません（OCR に Claude API を使う場合のみ、その画像が Anthropic の API に送られます）。

## できること

| 機能 | 内容 |
|---|---|
| 仕訳帳 | 借方/貸方・税区分（内税自動計算）・取引先・品目・摘要を記帳。よく使うパターン（経費/売上/入金など）をワンタッチで呼び出し |
| 証跡管理 | 領収書・レシート・受領した請求書・発行した請求書の控え・通帳明細などを画像/PDFで保存。日付・金額・取引先・種別・未仕訳で検索できるギャラリー。SHA-256 で重複検出 |
| OCR / AI 仕訳提案 | Claude が画像・PDFから日付・店名・合計・消費税・登録番号・**勘定科目候補**を抽出。確認して1クリックで仕訳化。APIキーが無い場合はキーワード辞書（Tesseract 経由）で科目推定 |
| 請求書の発行 | 明細入力→税率別に自動計算→印刷/PDF保存。発行で「売掛金/売上高」、入金登録で「普通預金/売掛金」（振込手数料も）を自動仕訳。送付したPDFを控えとして添付 |
| レポート | 売上・経費・差引金額、科目別の損益計算書、月別推移、取引先別集計 |
| CSV 出力 | freee 仕訳帳CSV（97列、UTF-8/LF/全項目引用符、税額は内税切り捨て）。電子帳簿保存法向けの証跡索引簿CSV |
| CSV 取込 | freee からエクスポートした仕訳帳CSV（UTF-8 / Shift_JIS）を取り込み。重複はスキップ |
| バックアップ | DB + 証跡ファイル + 設定を ZIP で一括保存 |

## 動作環境

- Python 3.10 以上（3.11 で動作確認）
- ブラウザ（Chrome / Edge / Safari / Firefox）
- OCR を使う場合: Anthropic API キー（[console.anthropic.com](https://console.anthropic.com/) で発行）

## セットアップと起動

```bash
cd kaikei-local

# macOS / Linux
./start.sh

# Windows
start.bat

# 手動で行う場合
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py                    # http://127.0.0.1:8765 がブラウザで開きます
```

`python run.py --port 9000` でポート変更、`--no-browser` でブラウザ自動起動を抑止できます。
サーバーは `127.0.0.1` にのみバインドされるので、他のPCからはアクセスできません。

## 最初にやること

1. **設定** で屋号・氏名・メールアドレス（freee CSV の「作成者」列に入ります）を入力
2. OCR を使うなら **Anthropic API キー** を登録（`data/settings.json` にのみ保存されます。環境変数 `ANTHROPIC_API_KEY` でも可）
3. 既存の freee データがあれば **CSV出力・取込** から仕訳帳CSVを取り込む
4. あとは **証跡** に領収書を放り込むだけ。OCR → 内容確認 → 「この内容で仕訳を登録」

## データの保存場所

```
kaikei-local/data/            ← 既定（環境変数 KAIKEI_DATA_DIR で変更可）
├── kaikei.db                 SQLite データベース（仕訳・証跡メタ・請求書・マスタ）
├── evidence/YYYY/MM/         証跡ファイルの原本（<ハッシュ12桁>_<元ファイル名>）
└── settings.json             設定（APIキー含む。git 管理外）
```

`data/` は `.gitignore` 済みです。バックアップは画面の「バックアップZIP」か、このフォルダをそのままコピーしてください。

## freee 仕訳帳CSVについて

- 添付いただいた freee のエクスポートファイルと同じ 97 列のヘッダ・並び・引用符付け（全項目 `"`）・UTF-8（BOMなし）・LF 改行で出力します。
- 税額は「税込金額 × 税率 ÷ (100+税率)」を切り捨てで計算します（freee の値と一致することをテストで確認済み）。
- 「取引ID」「仕訳ID」は、freee から取り込んだ仕訳は元の ID を、アプリで作成した仕訳は内部 ID を出力します。
- 勘定科目コード（ショートカット２）は、CSV で確認できた 4 科目（消耗品費 710 / 交際費 707 / 支払手数料 725 / 事業主借 390）のみ初期設定しています。
  他の科目は空欄です（freee のインポートは科目名で照合されるため問題ありません）。必要なら **勘定科目・取引先** 画面で入力してください。
- Excel で開くときは「BOM を付ける」をオンにすると文字化けしません。freee に取り込む場合はオフのままにしてください。

## OCR について

| プロバイダ | 対応形式 | 精度 | 備考 |
|---|---|---|---|
| `claude`（既定） | 画像（JPEG/PNG/WebP/GIF/HEIC※）/ PDF | 高い。科目・税区分まで提案 | 既定モデル `claude-opus-5`。構造化出力で JSON を受け取り、マスタに無い科目は自動補正。安全分類器による拒否時はサーバ側で別モデルへ自動フォールバック（設定でオフ可） |
| `tesseract` | 画像のみ | 低め | `pip install pytesseract` と Tesseract 本体（日本語データ `jpn`）が必要。テキストからキーワード辞書で科目推定 |
| `none` | — | — | 手入力 |

※ HEIC は Pillow で変換できない環境では読み取れません。iPhone の設定で「互換性優先（JPEG）」にするか、JPEG に変換してからアップロードしてください。

OCR 結果はあくまで候補です。必ず内容を確認してから仕訳を登録してください（私用との切り分け、按分などは自動判定しません）。

## 電子帳簿保存法への対応メモ

- 証跡は原本のまま保存され、ファイル名にハッシュ、DB に SHA-256・登録日時を記録します。
- 「取引日・金額・取引先」で検索できる一覧（証跡画面のフィルタ）と、索引簿CSVを用意しています。
- 訂正・削除の履歴管理（タイムスタンプ等）は行っていないため、事務処理規程を備える運用と組み合わせてください。

## 開発

```bash
pip install -r requirements.txt pytest
python -m pytest -q          # 18 テスト（CSV ラウンドトリップ、税計算、API、OCR モック）
python run.py --reload       # コード変更で自動再起動
```

```
kaikei-local/
├── run.py                 起動スクリプト
├── app/
│   ├── main.py            FastAPI アプリ
│   ├── config.py          保存先・設定
│   ├── db.py              SQLite スキーマ
│   ├── models.py          入出力スキーマ
│   ├── services.py        仕訳・証跡・請求書・集計ロジック
│   ├── tax.py             税区分・内税計算
│   ├── accounts.py        勘定科目の初期値
│   ├── freee_csv.py       freee 形式 CSV 入出力
│   ├── ocr/               Claude / Tesseract / ルール分類
│   └── routers/           API エンドポイント
├── static/                画面（依存なしの HTML/CSS/JS）
└── tests/                 pytest（fixtures/freee_sample.csv はメールアドレスをダミーに置換済み）
```

API 仕様は起動後 `http://127.0.0.1:8765/api/docs` で確認できます。
