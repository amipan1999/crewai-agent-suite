from app.ocr.rules import classify_text, extract_fields_from_text


def test_classify_keywords():
    assert classify_text("スターバックス コーヒー") == "会議費"
    assert classify_text("JR東日本 乗車券") == "旅費交通費"
    assert classify_text("ヨドバシカメラ USBケーブル") == "消耗品費"
    assert classify_text("居酒屋 とり吉") == "交際費"
    assert classify_text("ENEOS 給油") == "車両費"
    assert classify_text("まったく分からない") == "雑費"


def test_classify_respects_master():
    accounts = [{"name": "消耗品費"}, {"name": "雑費"}]
    assert classify_text("スターバックス", accounts) == "雑費"


def test_extract_fields():
    text = """セブン-イレブン 渋谷店
2026年08月20日 18:32
おにぎり ※          150
コピー用紙          550
合計           ¥700
(内消費税等        ¥58)
登録番号 T1234567890123
クレジット
"""
    r = extract_fields_from_text(text)
    assert r["date"] == "2026-08-20"
    assert r["total"] == 700
    assert r["tax"] == 58
    assert r["registration_number"] == "T1234567890123"
    assert r["vendor"].startswith("セブン-イレブン")
    assert r["payment_method"] == "クレジットカード"
    assert r["suggested_account"] == "消耗品費"


def test_extract_reiwa_date():
    r = extract_fields_from_text("領収書\n令和8年6月3日\n合計 1,100円")
    assert r["date"] == "2026-06-03"
    assert r["total"] == 1100
