import csv
import io

from app import config
from app.db import get_conn
from app.freee_csv import HEADERS, export_csv, import_csv, parse_csv
from tests.conftest import SAMPLE_CSV

VOLATILE = {"作成日時", "更新日時"}


def test_header_has_97_columns():
    assert len(HEADERS) == 97
    sample = SAMPLE_CSV.read_text(encoding="utf-8")
    first = next(csv.reader(io.StringIO(sample)))
    assert first == HEADERS


def test_import_then_export_roundtrip(data_dir):
    sample = SAMPLE_CSV.read_text(encoding="utf-8")
    config.save_settings({"owner_email": "owner@example.com", "tax_method": "税込経理"})
    with get_conn() as conn:
        result = import_csv(conn, sample)
        assert result["imported"] == 33
        assert result["errors"] == []
        # 再インポートは重複としてスキップ
        again = import_csv(conn, sample)
        assert again["imported"] == 0 and again["skipped"] == 33
        exported = export_csv(conn, config.load_settings(), year=2026)

    assert "\r\n" not in exported
    assert not exported.startswith("﻿")
    orig_rows = list(csv.reader(io.StringIO(sample)))
    new_rows = list(csv.reader(io.StringIO(exported)))
    assert new_rows[0] == HEADERS
    assert len(new_rows) == len(orig_rows) == 34
    for o, n in zip(orig_rows[1:], new_rows[1:]):
        for h, ov, nv in zip(HEADERS, o, n):
            if h in VOLATILE:
                continue
            assert ov == nv, f"列 {h}: 期待 {ov!r} 実際 {nv!r}"
    # 全フィールドがクォートされている
    assert exported.splitlines()[1].startswith('"1","2026-06-03"')


def test_export_manual_entry_computes_tax(data_dir, client):
    config.save_settings({"owner_email": "me@example.com"})
    r = client.post("/api/entries", json={
        "date": "2026-09-01", "debit_account": "消耗品費", "debit_amount": 11000,
        "credit_account": "事業主借", "description": "プリンタインク", "debit_item": "インク",
    })
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["debit_tax_category"] == "課対仕入10%"
    assert e["debit_tax_amount"] == 1000
    assert e["credit_tax_category"] == "対象外"
    assert e["credit_amount"] == 11000
    csv_text = client.get("/api/export/freee", params={"year": 2026}).text
    rows = list(csv.DictReader(io.StringIO(csv_text)))
    assert len(rows) == 1
    row = rows[0]
    assert row["借方勘定科目"] == "消耗品費"
    assert row["借方勘定科目ショートカット２（勘定科目コード）"] == "710"
    assert row["借方勘定科目ショートカット１"] == "SHOUMOU"
    assert row["借方税金額"] == "1000"
    assert row["貸方勘定科目"] == "事業主借"
    assert row["貸方勘定科目ショートカット２（勘定科目コード）"] == "390"
    assert row["貸方税区分"] == "対象外"
    assert row["借方品目"] == "インク"
    assert row["取引内容"] == "プリンタインク"
    assert row["作成者"] == "me@example.com"
    assert row["消費税経理処理方法"] == "税込経理"
    assert row["仕訳行番号"] == "1" and row["仕訳行数"] == "1"
    assert row["承認状況(仕訳承認)"] == "なし"


def test_parse_rejects_other_csv():
    import pytest

    with pytest.raises(ValueError):
        parse_csv("a,b,c\n1,2,3\n")
