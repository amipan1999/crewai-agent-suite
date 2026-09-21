"""キーワード辞書による勘定科目の推定と、テキストからの日付・金額抽出.

Claude が使えないとき（Tesseract / 手入力テキスト）のフォールバックとして使う。
Claude の結果に無い科目が返ってきたときの補正にも使う。
"""

from __future__ import annotations

import re
from typing import Any

RESULT_KEYS = [
    "doc_type",  # receipt | invoice_received | invoice_issued | other
    "date",  # YYYY-MM-DD
    "vendor",
    "total",  # 税込合計
    "tax",  # 消費税額
    "tax_rate",  # 10 / 8 / 0
    "has_reduced_rate",
    "registration_number",  # T + 13桁
    "payment_method",
    "suggested_account",
    "suggested_tax_category",
    "description",
    "confidence",
]

# (勘定科目, キーワード...)  上から順に評価する
KEYWORD_RULES: list[tuple[str, list[str]]] = [
    ("旅費交通費", ["タクシー", "taxi", "jr", "新幹線", "鉄道", "電車", "地下鉄", "メトロ", "バス", "航空", "ana", "jal", "peach", "jetstar", "skymark",
                    "suica", "pasmo", "icoca", "高速", "etc", "駐車", "パーキング", "宿泊", "ホテル", "hotel", "旅館", "レンタカー", "乗車券", "特急", "空港"]),
    ("会議費", ["スターバックス", "starbucks", "ドトール", "doutor", "タリーズ", "tully", "エクセルシオール", "コメダ", "喫茶", "カフェ", "cafe", "coffee", "珈琲", "打合せ", "打ち合わせ", "会議"]),
    ("交際費", ["居酒屋", "レストラン", "restaurant", "寿司", "鮨", "焼肉", "焼き鳥", "焼鳥", "バー", "bar", "ダイニング", "dining", "割烹", "料亭", "酒場", "ビアホール", "食堂",
              "ラーメン", "そば", "うどん", "イタリアン", "フレンチ", "中華", "接待", "会食", "懇親", "贈答", "お中元", "お歳暮", "御礼", "花", "ギフト", "gift", "手土産"]),
    ("通信費", ["ntt", "docomo", "ドコモ", "softbank", "ソフトバンク", "au", "kddi", "楽天モバイル", "povo", "ahamo", "uq", "ワイモバイル", "y!mobile", "iijmio", "mineo",
              "インターネット", "プロバイダ", "wi-fi", "wifi", "光回線", "フレッツ", "切手", "郵便", "レターパック", "はがき", "aws", "amazon web services", "google cloud",
              "google workspace", "microsoft 365", "office 365", "sakura", "さくらインターネット", "xserver", "エックスサーバー", "conoha", "お名前.com", "ドメイン", "domain",
              "サーバー", "server", "slack", "zoom", "chatgpt", "openai", "anthropic", "claude", "github", "notion", "dropbox", "icloud", "adobe", "canva", "サブスク", "subscription"]),
    ("水道光熱費", ["電気", "電力", "東京電力", "関西電力", "中部電力", "九州電力", "東北電力", "北海道電力", "ガス", "東京ガス", "大阪ガス", "水道", "上下水道", "灯油"]),
    ("新聞図書費", ["書店", "本屋", "紀伊國屋", "紀伊国屋", "ジュンク堂", "丸善", "有隣堂", "tsutaya", "蔦屋", "kindle", "書籍", "図書", "新聞", "日経", "雑誌", "amazon.co.jp 書籍", "楽天ブックス", "オライリー", "技術評論社", "翔泳社", "電子書籍", "ebook"]),
    ("荷造運賃", ["ヤマト", "クロネコ", "佐川", "ゆうパック", "宅急便", "宅配", "配送料", "送料", "運賃", "梱包", "段ボール", "ダンボール"]),
    ("広告宣伝費", ["広告", "meta ads", "facebook ads", "google ads", "google 広告", "yahoo 広告", "リスティング", "チラシ", "名刺", "看板", "ノベルティ", "印刷", "プリントパック", "ラクスル", "raksul", "宣伝", "ホームページ制作", "lp制作"]),
    ("租税公課", ["収入印紙", "印紙", "自動車税", "固定資産税", "個人事業税", "登録免許税", "証紙", "税務署", "県税事務所", "都税事務所", "市税事務所"]),
    ("地代家賃", ["家賃", "賃料", "賃貸", "コワーキング", "coworking", "レンタルオフィス", "シェアオフィス", "wework", "月極", "駐車場代"]),
    ("損害保険料", ["損害保険", "火災保険", "自動車保険", "賠償責任保険", "保険料"]),
    ("修繕費", ["修理", "修繕", "リペア", "repair", "メンテナンス", "点検", "交換工事"]),
    ("支払手数料", ["振込手数料", "手数料", "fee", "paypal", "stripe", "決済手数料", "事務手数料", "更新料", "行政書士", "司法書士", "税理士", "弁護士", "会計士", "freee", "マネーフォワード", "弥生"]),
    ("外注工賃", ["外注", "業務委託", "委託料", "制作費", "デザイン料", "開発費", "ランサーズ", "lancers", "クラウドワークス", "crowdworks", "ココナラ", "coconala"]),
    ("車両費", ["ガソリン", "eneos", "エネオス", "出光", "idemitsu", "apollostation", "コスモ石油", "cosmo", "昭和シェル", "shell", "給油", "軽油", "オイル交換", "洗車", "タイヤ", "車検"]),
    ("研修費", ["セミナー", "研修", "講座", "受講", "udemy", "スクール", "勉強会", "カンファレンス", "conference", "資格試験", "受験料"]),
    ("諸会費", ["会費", "年会費", "商工会", "協会", "組合", "青色申告会"]),
    ("福利厚生費", ["健康診断", "人間ドック", "慰安", "社員旅行", "忘年会", "新年会"]),
    ("消耗品費", ["amazon", "アマゾン", "ヨドバシ", "yodobashi", "ビックカメラ", "bic camera", "ヤマダ電機", "ケーズデンキ", "エディオン", "ノジマ", "joshin",
                "apple", "アップル", "文具", "文房具", "コクヨ", "アスクル", "askul", "カウネット", "たのめーる", "ロフト", "loft", "東急ハンズ", "ハンズ", "hands",
                "ダイソー", "daiso", "セリア", "seria", "キャンドゥ", "無印良品", "muji", "ニトリ", "nitori", "ikea", "イケア", "ホームセンター", "カインズ", "コーナン",
                "ドン・キホーテ", "ドンキ", "セブン-イレブン", "セブンイレブン", "7-eleven", "ローソン", "lawson", "ファミリーマート", "familymart", "ミニストップ",
                "コンビニ", "イオン", "aeon", "イトーヨーカドー", "西友", "ライフ", "スーパー", "楽天市場", "rakuten", "yahoo!ショッピング", "メルカリ", "モノタロウ", "monotaro",
                "pc", "パソコン", "マウス", "キーボード", "モニター", "ケーブル", "usb", "電池", "インク", "トナー", "用紙", "コピー用紙", "封筒", "ペン", "ノート", "ファイル", "備品", "工具"]),
]

DATE_PATTERNS = [
    re.compile(r"(20\d{2})[年/\-.](\d{1,2})[月/\-.](\d{1,2})"),
    re.compile(r"(?:令和|R)\s*(\d{1,2})[年.\-/](\d{1,2})[月.\-/](\d{1,2})"),
    re.compile(r"(\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})"),
]
TOTAL_PATTERNS = [
    re.compile(r"(?:合\s*計|お買上げ?合計|お買い上げ|総額|ご請求金額|請求金額|請求額|お支払い?金額|お支払額|税込合計|合計金額|total)[^\d¥\\]{0,12}[¥\\￥]?\s*([\d,]{2,})", re.I),
]
TAX_PATTERNS = [
    re.compile(r"(?:内\s*消費税|消費税等?|内税|外税|税額|tax)[^\d]{0,12}[¥\\￥]?\s*([\d,]{1,})", re.I),
]
REG_NO_PATTERN = re.compile(r"T\s*(\d{13})")
YEN_PATTERN = re.compile(r"[¥\\￥]\s*([\d,]{2,})")


def classify_text(text: str, accounts: list[dict[str, Any]] | None = None) -> str:
    """テキストから勘定科目を推定する。該当なしは 雑費."""
    available = {a["name"] for a in accounts} if accounts else None
    lowered = (text or "").lower()
    for account, words in KEYWORD_RULES:
        if available is not None and account not in available:
            continue
        for w in words:
            if w in lowered:
                return account
    if available is None or "雑費" in available:
        return "雑費"
    return next(iter(available)) if available else "雑費"


def _to_int(s: str) -> int | None:
    s = s.replace(",", "")
    return int(s) if s.isdigit() else None


def extract_fields_from_text(text: str, accounts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """OCR済みテキストから日付・合計・税額などをヒューリスティックに拾う."""
    result: dict[str, Any] = {k: None for k in RESULT_KEYS}
    result["raw_text"] = text
    result["warnings"] = []
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]

    # 日付
    for pat in DATE_PATTERNS:
        m = pat.search(text or "")
        if m:
            y, mo, d = m.groups()
            year = int(y)
            if pat is DATE_PATTERNS[1]:
                year = 2018 + year  # 令和
            elif year < 100:
                year += 2000
            try:
                result["date"] = f"{year:04d}-{int(mo):02d}-{int(d):02d}"
            except ValueError:
                pass
            break

    # 合計金額
    total = None
    for pat in TOTAL_PATTERNS:
        for m in pat.finditer(text or ""):
            v = _to_int(m.group(1))
            if v:
                total = v if total is None else max(total, v)
    if total is None:
        candidates = [_to_int(m.group(1)) for m in YEN_PATTERN.finditer(text or "")]
        candidates = [c for c in candidates if c]
        if candidates:
            total = max(candidates)
            result["warnings"].append("合計欄が見つからなかったため最大の金額を合計として採用しました")
    result["total"] = total

    for pat in TAX_PATTERNS:
        m = pat.search(text or "")
        if m:
            result["tax"] = _to_int(m.group(1))
            break

    m = REG_NO_PATTERN.search(text or "")
    if m:
        result["registration_number"] = "T" + m.group(1)

    reduced = ("軽減" in (text or "")) or ("※" in (text or "") and "8%" in (text or ""))
    result["has_reduced_rate"] = reduced
    result["tax_rate"] = 8 if reduced and "10%" not in (text or "") else 10

    # 店名: 先頭付近の日本語/英字を含む行
    for ln in lines[:6]:
        if re.search(r"[A-Za-z぀-ヿ㐀-鿿]", ln) and not re.search(r"領収|レシート|receipt|明細|御|様", ln):
            result["vendor"] = ln[:40]
            break

    result["doc_type"] = "invoice_received" if re.search(r"請求書|御請求|invoice", text or "", re.I) else "receipt"
    result["payment_method"] = "現金"
    if re.search(r"クレジット|credit|visa|master|jcb|amex|カード", text or "", re.I):
        result["payment_method"] = "クレジットカード"
    elif re.search(r"paypay|suica|pasmo|交通系|電子マネー|id|quicpay|楽天ペイ|d払い", text or "", re.I):
        result["payment_method"] = "電子マネー"

    result["suggested_account"] = classify_text(text, accounts)
    result["description"] = (result.get("vendor") or "") + (" 領収書" if result["doc_type"] == "receipt" else " 請求書")
    result["confidence"] = 0.4 if total else 0.2
    result["items"] = []
    return result
