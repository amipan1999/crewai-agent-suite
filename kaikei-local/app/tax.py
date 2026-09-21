"""消費税区分と税額計算.

freee の仕訳帳CSVに合わせた税区分名を使う。個人事業主の多くは税込経理・内税なので、
税額は「税込金額 × 税率 / (100 + 税率)」を切り捨てで求める（freee の出力と一致）。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TaxCategory:
    name: str
    rate: int  # %
    reduced: bool  # 軽減税率
    side: str  # "purchase" | "sales" | "none"


TAX_CATEGORIES: list[TaxCategory] = [
    TaxCategory("課対仕入10%", 10, False, "purchase"),
    TaxCategory("課対仕入8%（軽）", 8, True, "purchase"),
    TaxCategory("課対仕入8%", 8, False, "purchase"),
    TaxCategory("非課仕入", 0, False, "purchase"),
    TaxCategory("課税売上10%", 10, False, "sales"),
    TaxCategory("課税売上8%（軽）", 8, True, "sales"),
    TaxCategory("課税売上8%", 8, False, "sales"),
    TaxCategory("非課売上", 0, False, "sales"),
    TaxCategory("不課税", 0, False, "none"),
    TaxCategory("対象外", 0, False, "none"),
]

TAX_BY_NAME = {t.name: t for t in TAX_CATEGORIES}


def normalize_tax_name(name: str | None) -> str:
    """半角括弧や表記ゆれを freee 表記へ寄せる."""
    if not name:
        return "対象外"
    n = name.strip().replace("(", "（").replace(")", "）").replace("％", "%")
    if n in TAX_BY_NAME:
        return n
    if "軽" in n and "仕入" in n:
        return "課対仕入8%（軽）"
    if "軽" in n and "売上" in n:
        return "課税売上8%（軽）"
    if "仕入" in n and "10" in n:
        return "課対仕入10%"
    if "売上" in n and "10" in n:
        return "課税売上10%"
    if "非課" in n and "仕入" in n:
        return "非課仕入"
    if "非課" in n and "売上" in n:
        return "非課売上"
    return "対象外"


def tax_info(tax_category: str | None) -> TaxCategory:
    return TAX_BY_NAME.get(normalize_tax_name(tax_category), TAX_BY_NAME["対象外"])


def included_tax(amount: int, tax_category: str | None) -> int:
    """税込金額に含まれる消費税額（内税・切り捨て）."""
    t = tax_info(tax_category)
    if t.rate == 0 or amount <= 0:
        return 0
    return amount * t.rate // (100 + t.rate)


def split_amount(amount: int, tax_category: str | None) -> tuple[int, int]:
    """税込金額 -> (税抜金額, 消費税額)."""
    tax = included_tax(amount, tax_category)
    return amount - tax, tax


def tax_from_exclusive(net: int, tax_category: str | None) -> int:
    """税抜金額から消費税額（切り捨て）."""
    t = tax_info(tax_category)
    if t.rate == 0 or net <= 0:
        return 0
    return net * t.rate // 100
