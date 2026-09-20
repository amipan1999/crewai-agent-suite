"""勘定科目・取引先・税区分・設定."""

from __future__ import annotations

import os
import platform

from fastapi import APIRouter, HTTPException

from .. import config
from ..accounts import CATEGORY_LABELS
from ..db import get_conn, now_str, rows_to_dicts
from ..models import AccountIn, PartnerIn, SettingsIn
from ..services import EVIDENCE_KINDS
from ..tax import TAX_CATEGORIES

router = APIRouter(prefix="/api", tags=["masters"])


@router.get("/meta")
def meta():
    with get_conn() as conn:
        accounts = rows_to_dicts(conn.execute("SELECT * FROM accounts ORDER BY sort_order, id"))
        partners = rows_to_dicts(conn.execute("SELECT * FROM partners ORDER BY name"))
        years = [r[0] for r in conn.execute("SELECT DISTINCT substr(date,1,4) FROM entries ORDER BY 1 DESC")]
    return {
        "accounts": accounts,
        "partners": partners,
        "tax_categories": [t.__dict__ for t in TAX_CATEGORIES],
        "category_labels": CATEGORY_LABELS,
        "evidence_kinds": EVIDENCE_KINDS,
        "years": years,
        "settings": config.public_settings(),
        "data_dir": str(config.DATA_DIR),
    }


@router.get("/accounts")
def list_accounts():
    with get_conn() as conn:
        return rows_to_dicts(conn.execute("SELECT * FROM accounts ORDER BY sort_order, id"))


@router.post("/accounts")
def create_account(data: AccountIn):
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM accounts WHERE name=?", (data.name,)).fetchone():
            raise HTTPException(400, "同名の勘定科目があります")
        cur = conn.execute(
            "INSERT INTO accounts(name, display_name, shortcut1, code, category, default_tax_category, is_active, sort_order)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (data.name, data.display_name or data.name, data.shortcut1, data.code, data.category,
             data.default_tax_category, int(data.is_active), data.sort_order),
        )
        return dict(conn.execute("SELECT * FROM accounts WHERE id=?", (cur.lastrowid,)).fetchone())


@router.put("/accounts/{account_id}")
def update_account(account_id: int, data: AccountIn):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(404, "勘定科目が見つかりません")
        old_name = row["name"]
        conn.execute(
            "UPDATE accounts SET name=?, display_name=?, shortcut1=?, code=?, category=?, default_tax_category=?,"
            " is_active=?, sort_order=? WHERE id=?",
            (data.name, data.display_name or data.name, data.shortcut1, data.code, data.category,
             data.default_tax_category, int(data.is_active), data.sort_order, account_id),
        )
        if old_name != data.name:
            conn.execute("UPDATE entries SET debit_account=? WHERE debit_account=?", (data.name, old_name))
            conn.execute("UPDATE entries SET credit_account=? WHERE credit_account=?", (data.name, old_name))
        return dict(conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone())


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT name FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(404, "勘定科目が見つかりません")
        used = conn.execute("SELECT COUNT(*) FROM entries WHERE debit_account=? OR credit_account=?", (row["name"], row["name"])).fetchone()[0]
        if used:
            raise HTTPException(400, f"この科目は {used} 件の仕訳で使われているため削除できません（無効化してください）")
        conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    return {"ok": True}


@router.get("/partners")
def list_partners():
    with get_conn() as conn:
        return rows_to_dicts(conn.execute("SELECT * FROM partners ORDER BY name"))


@router.post("/partners")
def create_partner(data: PartnerIn):
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM partners WHERE name=?", (data.name,)).fetchone():
            raise HTTPException(400, "同名の取引先があります")
        cur = conn.execute(
            "INSERT INTO partners(name, code, kind, registration_number, address, email, memo, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (data.name, data.code, data.kind, data.registration_number, data.address, data.email, data.memo, now_str()),
        )
        return dict(conn.execute("SELECT * FROM partners WHERE id=?", (cur.lastrowid,)).fetchone())


@router.put("/partners/{partner_id}")
def update_partner(partner_id: int, data: PartnerIn):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM partners WHERE id=?", (partner_id,)).fetchone()
        if not row:
            raise HTTPException(404, "取引先が見つかりません")
        conn.execute(
            "UPDATE partners SET name=?, code=?, kind=?, registration_number=?, address=?, email=?, memo=? WHERE id=?",
            (data.name, data.code, data.kind, data.registration_number, data.address, data.email, data.memo, partner_id),
        )
        if row["name"] != data.name:
            conn.execute("UPDATE entries SET debit_partner=? WHERE debit_partner=?", (data.name, row["name"]))
            conn.execute("UPDATE entries SET credit_partner=? WHERE credit_partner=?", (data.name, row["name"]))
        return dict(conn.execute("SELECT * FROM partners WHERE id=?", (partner_id,)).fetchone())


@router.delete("/partners/{partner_id}")
def delete_partner(partner_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM partners WHERE id=?", (partner_id,))
    return {"ok": True}


@router.get("/settings")
def get_settings():
    return config.public_settings()


@router.put("/settings")
def put_settings(data: SettingsIn):
    saved = config.save_settings(data.model_dump())
    return config.public_settings(saved)


@router.get("/system")
def system_info():
    tesseract = False
    try:
        import pytesseract  # type: ignore  # noqa: F401
        import shutil

        tesseract = shutil.which("tesseract") is not None
    except ImportError:
        tesseract = False
    return {
        "data_dir": str(config.DATA_DIR),
        "db_path": str(config.DB_PATH),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "anthropic_env_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "tesseract_available": tesseract,
    }
