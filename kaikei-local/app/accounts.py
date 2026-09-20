"""勘定科目マスタの初期値.

freee（個人事業主）の標準的な科目名に合わせている。
勘定科目コード（ショートカット２）は、添付CSVで確認できた 4 科目のみ設定し、
それ以外は空欄（freee のインポートは科目名で照合されるため空欄で問題ない）。
画面の「勘定科目」から自由に追加・編集できる。
"""

from __future__ import annotations

# (name, display_name, shortcut1, code, category, default_tax_category)
# category: asset / liability / equity / revenue / expense
DEFAULT_ACCOUNTS: list[tuple[str, str, str, str, str, str]] = [
    # 資産
    ("現金", "現金", "GENKIN", "", "asset", "対象外"),
    ("普通預金", "普通預金", "FUTSUU", "", "asset", "対象外"),
    ("売掛金", "売掛金", "URIKAKE", "", "asset", "対象外"),
    ("未収入金", "未収入金", "MISHUU", "", "asset", "対象外"),
    ("前払金", "前払金", "MAEBARAI", "", "asset", "対象外"),
    ("立替金", "立替金", "TATEKAE", "", "asset", "対象外"),
    ("仮払金", "仮払金", "KARIBARAI", "", "asset", "対象外"),
    ("工具器具備品", "工具器具備品", "KOUGU", "", "asset", "課対仕入10%"),
    ("車両運搬具", "車両運搬具", "SHARYOUUN", "", "asset", "課対仕入10%"),
    ("事業主貸", "事業主貸", "JIGYOUKASHI", "", "asset", "対象外"),
    # 負債
    ("買掛金", "買掛金", "KAIKAKE", "", "liability", "対象外"),
    ("未払金", "未払金", "MIBARAI", "", "liability", "対象外"),
    ("預り金", "預り金", "AZUKARI", "", "liability", "対象外"),
    ("前受金", "前受金", "MAEUKE", "", "liability", "対象外"),
    ("借入金", "借入金", "KARIIRE", "", "liability", "対象外"),
    # 資本
    ("事業主借", "事業主借", "JIGYOU", "390", "equity", "対象外"),
    ("元入金", "元入金", "MOTOIRE", "", "equity", "対象外"),
    # 収益
    ("売上高", "売上高", "URIAGE", "", "revenue", "課税売上10%"),
    ("雑収入", "雑収入", "ZATSUSHUU", "", "revenue", "課税売上10%"),
    ("家事消費等", "家事消費等", "KAJISHOUHI", "", "revenue", "課税売上10%"),
    ("受取利息", "受取利息", "UKETORIRISOKU", "", "revenue", "非課売上"),
    # 費用（青色申告決算書の並び）
    ("仕入高", "仕入高", "SHIIRE", "", "expense", "課対仕入10%"),
    ("租税公課", "租税公課", "SOZEI", "", "expense", "対象外"),
    ("荷造運賃", "荷造運賃", "NIZUKURI", "", "expense", "課対仕入10%"),
    ("水道光熱費", "水道光熱費", "SUIDOU", "", "expense", "課対仕入10%"),
    ("旅費交通費", "旅費交通費", "RYOHI", "", "expense", "課対仕入10%"),
    ("通信費", "通信費", "TSUUSHIN", "", "expense", "課対仕入10%"),
    ("広告宣伝費", "広告宣伝費", "KOUKOKU", "", "expense", "課対仕入10%"),
    ("交際費", "交際費", "KOUSAI", "707", "expense", "課対仕入10%"),
    ("損害保険料", "損害保険料", "SONGAI", "", "expense", "非課仕入"),
    ("修繕費", "修繕費", "SHUUZEN", "", "expense", "課対仕入10%"),
    ("消耗品費", "消耗品費", "SHOUMOU", "710", "expense", "課対仕入10%"),
    ("減価償却費", "減価償却費", "GENKA", "", "expense", "対象外"),
    ("福利厚生費", "福利厚生費", "FUKURI", "", "expense", "課対仕入10%"),
    ("給料賃金", "給料賃金", "KYUURYOU", "", "expense", "対象外"),
    ("外注工賃", "外注工賃", "GAICHUU", "", "expense", "課対仕入10%"),
    ("利子割引料", "利子割引料", "RISHI", "", "expense", "非課仕入"),
    ("地代家賃", "地代家賃", "CHIDAI", "", "expense", "課対仕入10%"),
    ("貸倒金", "貸倒金", "KASHIDAORE", "", "expense", "対象外"),
    ("会議費", "会議費", "KAIGI", "", "expense", "課対仕入10%"),
    ("新聞図書費", "新聞図書費", "SHINBUN", "", "expense", "課対仕入10%"),
    ("支払手数料", "支払手数料", "SHIHARAI", "725", "expense", "課対仕入10%"),
    ("車両費", "車両費", "SHARYOU", "", "expense", "課対仕入10%"),
    ("研修費", "研修費", "KENSHUU", "", "expense", "課対仕入10%"),
    ("諸会費", "諸会費", "SHOKAIHI", "", "expense", "対象外"),
    ("事務用品費", "事務用品費", "JIMUYOUHIN", "", "expense", "課対仕入10%"),
    ("雑費", "雑費", "ZAPPI", "", "expense", "課対仕入10%"),
]

CATEGORY_LABELS = {
    "asset": "資産",
    "liability": "負債",
    "equity": "資本",
    "revenue": "収益",
    "expense": "費用",
}
