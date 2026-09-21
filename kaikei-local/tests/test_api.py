import io
import zipfile

from PIL import Image

from app import config


def _png_bytes(color=(200, 30, 30)) -> bytes:
    img = Image.new("RGB", (640, 480), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_meta_and_settings_mask(client):
    r = client.get("/api/meta")
    assert r.status_code == 200
    meta = r.json()
    names = {a["name"] for a in meta["accounts"]}
    assert {"消耗品費", "交際費", "事業主借", "売上高"} <= names
    r = client.put("/api/settings", json={"anthropic_api_key": "sk-ant-secret-1234", "owner_email": "x@example.com"})
    assert r.json()["anthropic_api_key"].endswith("1234")
    assert "secret" not in r.json()["anthropic_api_key"]
    assert r.json()["anthropic_api_key_configured"] is True
    # マスク値を送り返してもキーは上書きされない
    client.put("/api/settings", json={"anthropic_api_key": r.json()["anthropic_api_key"]})
    assert config.load_settings()["anthropic_api_key"] == "sk-ant-secret-1234"


def test_evidence_upload_duplicate_and_apply(client):
    client.put("/api/settings", json={"ocr_provider": "none", "auto_ocr_on_upload": False})
    png = _png_bytes()
    r = client.post("/api/evidence", files={"file": ("receipt.png", png, "image/png")},
                    data={"kind": "receipt", "vendor": "文具店", "doc_date": "2026-09-02"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["duplicate"] is False
    ev = body["evidence"]
    assert ev["sha256"] and ev["stored_path"].startswith("2026/09/")
    assert (config.EVIDENCE_DIR / ev["stored_path"]).exists()

    # 同じファイルは重複として検出
    r = client.post("/api/evidence", files={"file": ("receipt2.png", png, "image/png")})
    assert r.json()["duplicate"] is True

    # サムネイル・原本取得
    assert client.get(f"/api/evidence/{ev['id']}/thumbnail").headers["content-type"] == "image/jpeg"
    assert client.get(f"/api/evidence/{ev['id']}/file").status_code == 200

    # OCR プロバイダ none -> 422 で分かりやすいエラー
    r = client.post(f"/api/evidence/{ev['id']}/ocr")
    assert r.status_code == 422
    assert "OCR プロバイダ" in r.json()["detail"]

    # OCR 無しでも手入力値から仕訳を作成できる
    r = client.post(f"/api/evidence/{ev['id']}/apply", json={"amount": 3300, "debit_account": "消耗品費", "description": "ノート"})
    assert r.status_code == 201, r.text
    entry = r.json()["entry"]
    assert entry["debit_account"] == "消耗品費" and entry["credit_account"] == "事業主借"
    assert entry["debit_amount"] == 3300 and entry["debit_tax_amount"] == 300
    assert entry["debit_partner"] == "文具店"
    assert [e["id"] for e in entry["evidence"]] == [ev["id"]]

    # 証跡側からも仕訳が見える／紐づき済みフィルタ
    ev2 = client.get(f"/api/evidence/{ev['id']}").json()
    assert ev2["linked"] is True and ev2["entries"][0]["id"] == entry["id"]
    assert client.get("/api/evidence", params={"linked": "false"}).json()["total"] == 0
    assert client.get("/api/evidence", params={"q": "文具"}).json()["total"] == 1

    # 削除でファイルも消える
    path = config.EVIDENCE_DIR / ev["stored_path"]
    assert client.delete(f"/api/evidence/{ev['id']}").status_code == 200
    assert not path.exists()
    assert client.get(f"/api/entries/{entry['id']}").json()["evidence"] == []


def test_ocr_with_mocked_claude(client, monkeypatch):
    from app.ocr import claude_ocr

    def fake(*, path, mime, settings, accounts):
        assert settings["anthropic_api_key"] == "sk-test"
        return {
            "doc_type": "receipt", "date": "2026-07-19", "vendor": "焼肉 きんぐ", "total": 200000, "tax": 18181,
            "tax_rate": 10, "has_reduced_rate": False, "registration_number": None, "payment_method": "クレジットカード",
            "suggested_account": "接待交際費", "suggested_tax_category": "課対仕入10%", "description": "取引先との会食",
            "items": [{"name": "コース", "amount": 200000, "tax_rate": 10}], "confidence": 0.9, "raw_text": "焼肉 きんぐ 合計 ¥200,000",
        }

    monkeypatch.setattr(claude_ocr, "ocr_with_claude", fake)
    client.put("/api/settings", json={"ocr_provider": "claude", "anthropic_api_key": "sk-test", "auto_ocr_on_upload": True})
    r = client.post("/api/evidence", files={"file": ("yakiniku.png", _png_bytes((10, 10, 200)), "image/png")})
    assert r.status_code == 201, r.text
    ev = r.json()["evidence"]
    assert r.json()["ocr_error"] is None
    assert ev["ocr_status"] == "done"
    assert ev["doc_date"] == "2026-07-19" and ev["vendor"] == "焼肉 きんぐ" and ev["amount"] == 200000
    # マスタに無い「接待交際費」は「交際費」へ補正される
    assert ev["ocr"]["suggested_account"] == "交際費"

    r = client.post(f"/api/evidence/{ev['id']}/apply", json={})
    assert r.status_code == 201
    entry = r.json()["entry"]
    assert entry["date"] == "2026-07-19"
    assert entry["debit_account"] == "交際費" and entry["debit_amount"] == 200000 and entry["debit_tax_amount"] == 18181
    assert entry["source"] == "ocr"


def test_ocr_error_is_reported(client, monkeypatch):
    from app.ocr import OcrError, claude_ocr

    def boom(**kwargs):
        raise OcrError("Claude API キーが無効です。設定を確認してください。")

    monkeypatch.setattr(claude_ocr, "ocr_with_claude", boom)
    client.put("/api/settings", json={"ocr_provider": "claude", "anthropic_api_key": "sk-bad", "auto_ocr_on_upload": True})
    r = client.post("/api/evidence", files={"file": ("x.png", _png_bytes((1, 2, 3)), "image/png")})
    assert r.status_code == 201
    assert "無効" in r.json()["ocr_error"]
    assert r.json()["evidence"]["ocr_status"] == "error"


def test_invoice_flow_creates_entries(client):
    r = client.post("/api/invoices", json={
        "partner_name": "株式会社サンプル", "issue_date": "2026-09-10", "due_date": "2026-10-31", "subject": "9月分 開発業務",
        "items": [
            {"description": "Web開発", "quantity": 1, "unit": "式", "unit_price": 300000, "tax_rate": 10},
            {"description": "交通費", "quantity": 2, "unit": "回", "unit_price": 1500, "tax_rate": 10},
        ],
    })
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["invoice_no"] == "INV-2026-0001"
    assert inv["subtotal"] == 303000 and inv["tax"] == 30300 and inv["total"] == 333300
    assert inv["status"] == "draft" and inv["sale_entry_id"] is None

    # 発行 -> 売掛金 / 売上高
    inv = client.post(f"/api/invoices/{inv['id']}/status", json={"status": "issued"}).json()
    assert inv["status"] == "issued" and inv["sale_entry_id"]
    sale = client.get(f"/api/entries/{inv['sale_entry_id']}").json()
    assert sale["debit_account"] == "売掛金" and sale["credit_account"] == "売上高"
    assert sale["credit_amount"] == 333300 and sale["credit_tax_category"] == "課税売上10%" and sale["credit_tax_amount"] == 30300
    assert sale["debit_partner"] == "株式会社サンプル"

    # 入金（手数料 440円差引） -> 普通預金 / 売掛金 + 支払手数料 / 売掛金
    inv = client.post(f"/api/invoices/{inv['id']}/status", json={"status": "paid", "paid_date": "2026-10-25", "fee_amount": 440}).json()
    assert inv["status"] == "paid" and inv["paid_date"] == "2026-10-25"
    entries = client.get("/api/entries", params={"year": 2026}).json()["items"]
    accounts = sorted((e["debit_account"], e["credit_account"], e["debit_amount"]) for e in entries)
    assert ("普通預金", "売掛金", 332860) in accounts
    assert ("支払手数料", "売掛金", 440) in accounts
    assert ("売掛金", "売上高", 333300) in accounts

    # 2件目の採番
    inv2 = client.post("/api/invoices", json={"partner_name": "B社", "issue_date": "2026-09-30", "items": []}).json()
    assert inv2["invoice_no"] == "INV-2026-0002"

    # 集計
    summary = client.get("/api/reports/summary", params={"year": 2026}).json()
    assert summary["revenue_total"] == 333300
    assert summary["expense_total"] == 440
    assert summary["profit"] == 333300 - 440
    assert summary["months"][8]["revenue"] == 333300  # 9月
    partners = client.get("/api/reports/partners", params={"year": 2026}).json()
    assert partners[0]["partner"] == "株式会社サンプル" and partners[0]["sales"] == 333300

    # 削除で仕訳も消える
    assert client.delete(f"/api/invoices/{inv['id']}").status_code == 200
    assert client.get("/api/entries", params={"year": 2026}).json()["total"] == 0


def test_backup_and_evidence_index(client):
    client.put("/api/settings", json={"ocr_provider": "none", "auto_ocr_on_upload": False})
    client.post("/api/evidence", files={"file": ("a.png", _png_bytes(), "image/png")}, data={"doc_date": "2026-03-03", "vendor": "A店"})
    r = client.get("/api/backup")
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert "kaikei.db" in names and any(n.startswith("evidence/2026/03/") for n in names)
    idx = client.get("/api/export/evidence-index", params={"year": 2026}).text
    assert "A店" in idx and "2026-03-03" in idx


def test_import_endpoint(client):
    from tests.conftest import SAMPLE_CSV

    r = client.post("/api/import/freee", files={"file": ("freee.csv", SAMPLE_CSV.read_bytes(), "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 33
    assert client.get("/api/entries", params={"year": 2026, "account": "交際費"}).json()["total"] == 26
    # Shift_JIS でも読める
    sjis = SAMPLE_CSV.read_text(encoding="utf-8").encode("cp932")
    r = client.post("/api/import/freee", files={"file": ("freee.csv", sjis, "text/csv")})
    assert r.json()["skipped"] == 33
