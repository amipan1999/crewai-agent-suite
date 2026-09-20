from app.tax import included_tax, normalize_tax_name, split_amount, tax_from_exclusive


def test_included_tax_matches_freee_sample():
    # 添付CSVの値: 税込金額 -> 借方税金額
    assert included_tax(399985, "課対仕入10%") == 36362
    assert included_tax(14270, "課対仕入10%") == 1297
    assert included_tax(2160, "課対仕入10%") == 196
    assert included_tax(110, "課対仕入10%") == 10
    assert included_tax(200000, "課対仕入10%") == 18181


def test_reduced_rate_and_exempt():
    assert included_tax(1080, "課対仕入8%（軽）") == 80
    assert included_tax(1080, "課対仕入8%(軽)") == 80  # 半角括弧も許容
    assert included_tax(5000, "対象外") == 0
    assert included_tax(5000, "非課仕入") == 0
    assert split_amount(1100, "課税売上10%") == (1000, 100)
    assert tax_from_exclusive(1000, "課税売上10%") == 100


def test_normalize():
    assert normalize_tax_name("課対仕入10%") == "課対仕入10%"
    assert normalize_tax_name("課税売上8%（軽）") == "課税売上8%（軽）"
    assert normalize_tax_name("") == "対象外"
    assert normalize_tax_name("不課税") == "不課税"
