"""仕訳・証跡・請求書のビジネスロジック（ルーターから呼び出す）."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import date as date_type
from pathlib import Path
from typing import Any

from . import config
from .models import EntryIn, InvoiceIn
from .tax import included_tax, normalize_tax_name, tax_from_exclusive, tax_info
from .db import now_str, row_to_dict, rows_to_dicts


# ---------------------------------------------------------------- 勘定科目
def account_map(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    return {r["name"]: dict(r) for r in conn.execute("SELECT * FROM accounts")}


def ensure_account(conn: sqlite3.Connection, name: str | None, category_hint: str = "expense") -> None:
    """インポート時などに未知の科目が来たら自動で追加する."""
    if not name:
        return
    exists = conn.execute("SELECT 1 FROM accounts WHERE name=?", (name,)).fetchone()
    if exists:
        return
    max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) FROM accounts").fetchone()[0]
    conn.execute(
        "INSERT INTO accounts(name, display_name, shortcut1, code, category, default_tax_category, sort_order)"
        " VALUES (?,?,?,?,?,?,?)",
        (name, name, "", "", category_hint, "対象外" if category_hint != "expense" else "課対仕入10%", max_order + 10),
    )


def ensure_partner(conn: sqlite3.Connection, name: str | None) -> None:
    if not name:
        return
    if conn.execute("SELECT 1 FROM partners WHERE name=?", (name,)).fetchone():
        return
    conn.execute("INSERT INTO partners(name, created_at) VALUES (?, ?)", (name, now_str()))


# ------------------------------------------------------------------- 仕訳
def _resolve_tax(conn_accounts: dict[str, dict[str, Any]], account: str | None, given: str | None) -> str:
    if given:
        return normalize_tax_name(given)
    if account and account in conn_accounts:
        return conn_accounts[account]["default_tax_category"]
    return "対象外"


def entry_values(conn: sqlite3.Connection, data: EntryIn) -> dict[str, Any]:
    accounts = account_map(conn)
    debit_tax_cat = _resolve_tax(accounts, data.debit_account, data.debit_tax_category)
    credit_tax_cat = _resolve_tax(accounts, data.credit_account, data.credit_tax_category)
    credit_amount = data.debit_amount if data.credit_amount is None else data.credit_amount
    return {
        "date": data.date,
        "debit_account": data.debit_account or None,
        "debit_amount": data.debit_amount,
        "debit_tax_category": debit_tax_cat,
        "debit_tax_amount": included_tax(data.debit_amount, debit_tax_cat),
        "debit_partner": data.debit_partner,
        "debit_item": data.debit_item,
        "debit_memo": data.debit_memo,
        "debit_note": data.debit_note,
        "credit_account": data.credit_account or None,
        "credit_amount": credit_amount,
        "credit_tax_category": credit_tax_cat,
        "credit_tax_amount": included_tax(credit_amount, credit_tax_cat),
        "credit_partner": data.credit_partner,
        "credit_item": data.credit_item,
        "credit_memo": data.credit_memo,
        "credit_note": data.credit_note,
        "description": data.description,
        "payment_date": data.payment_date,
        "closing_flag": int(data.closing_flag),
        "adjustment_flag": int(data.adjustment_flag),
        "source": data.source,
    }


def create_entry(conn: sqlite3.Connection, data: EntryIn) -> dict[str, Any]:
    if not data.debit_account and not data.credit_account:
        raise ValueError("借方または貸方の勘定科目を指定してください")
    vals = entry_values(conn, data)
    ensure_account(conn, vals["debit_account"])
    ensure_account(conn, vals["credit_account"])
    ensure_partner(conn, vals["debit_partner"])
    ensure_partner(conn, vals["credit_partner"])
    ts = now_str()
    vals["created_at"] = ts
    vals["updated_at"] = ts
    cols = ", ".join(vals.keys())
    marks = ", ".join("?" for _ in vals)
    cur = conn.execute(f"INSERT INTO entries({cols}) VALUES ({marks})", list(vals.values()))
    entry_id = cur.lastrowid
    set_entry_evidence(conn, entry_id, data.evidence_ids)
    return get_entry(conn, entry_id)


def update_entry(conn: sqlite3.Connection, entry_id: int, data: EntryIn) -> dict[str, Any]:
    if not conn.execute("SELECT 1 FROM entries WHERE id=?", (entry_id,)).fetchone():
        raise KeyError(entry_id)
    vals = entry_values(conn, data)
    ensure_account(conn, vals["debit_account"])
    ensure_account(conn, vals["credit_account"])
    ensure_partner(conn, vals["debit_partner"])
    ensure_partner(conn, vals["credit_partner"])
    vals["updated_at"] = now_str()
    assignments = ", ".join(f"{k}=?" for k in vals)
    conn.execute(f"UPDATE entries SET {assignments} WHERE id=?", [*vals.values(), entry_id])
    set_entry_evidence(conn, entry_id, data.evidence_ids)
    return get_entry(conn, entry_id)


def set_entry_evidence(conn: sqlite3.Connection, entry_id: int, evidence_ids: list[int]) -> None:
    conn.execute("DELETE FROM entry_evidence WHERE entry_id=?", (entry_id,))
    for eid in dict.fromkeys(evidence_ids):
        if conn.execute("SELECT 1 FROM evidence WHERE id=?", (eid,)).fetchone():
            conn.execute("INSERT OR IGNORE INTO entry_evidence(entry_id, evidence_id) VALUES (?,?)", (entry_id, eid))


def _attach_evidence(conn: sqlite3.Connection, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not entries:
        return entries
    ids = [e["id"] for e in entries]
    marks = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT ee.entry_id, ev.id, ev.original_name, ev.mime, ev.kind FROM entry_evidence ee"
        f" JOIN evidence ev ON ev.id = ee.evidence_id WHERE ee.entry_id IN ({marks})",
        ids,
    )
    by_entry: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        by_entry.setdefault(r["entry_id"], []).append(
            {"id": r["id"], "original_name": r["original_name"], "mime": r["mime"], "kind": r["kind"]}
        )
    for e in entries:
        e["evidence"] = by_entry.get(e["id"], [])
    return entries


def get_entry(conn: sqlite3.Connection, entry_id: int) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
    if row is None:
        raise KeyError(entry_id)
    return _attach_evidence(conn, [dict(row)])[0]


def list_entries(
    conn: sqlite3.Connection,
    *,
    year: int | None = None,
    month: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    account: str | None = None,
    q: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    where = []
    params: list[Any] = []
    if year:
        where.append("substr(date,1,4)=?")
        params.append(f"{year:04d}")
    if month:
        where.append("substr(date,6,2)=?")
        params.append(f"{month:02d}")
    if date_from:
        where.append("date>=?")
        params.append(date_from)
    if date_to:
        where.append("date<=?")
        params.append(date_to)
    if account:
        where.append("(debit_account=? OR credit_account=?)")
        params += [account, account]
    if q:
        like = f"%{q}%"
        where.append(
            "(description LIKE ? OR debit_partner LIKE ? OR credit_partner LIKE ? OR debit_item LIKE ?"
            " OR credit_item LIKE ? OR debit_note LIKE ? OR credit_note LIKE ? OR debit_memo LIKE ?)"
        )
        params += [like] * 8
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM entries{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM entries{clause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    items = _attach_evidence(conn, rows_to_dicts(rows))
    return {"items": items, "total": total}


def delete_entry(conn: sqlite3.Connection, entry_id: int) -> None:
    conn.execute("DELETE FROM entries WHERE id=?", (entry_id,))


# ------------------------------------------------------------------- 証跡
EVIDENCE_KINDS = {
    "receipt": "領収書・レシート",
    "invoice_received": "請求書（受領）",
    "invoice_issued": "請求書（発行）",
    "delivery_note": "納品書・見積書",
    "bank": "通帳・明細",
    "contract": "契約書",
    "other": "その他",
}

SAFE_NAME_RE = re.compile(r"[^0-9A-Za-z._\-぀-ヿ㐀-鿿ｦ-ﾟ]+")


def safe_filename(name: str) -> str:
    base = Path(name).name
    base = SAFE_NAME_RE.sub("_", base).strip("._") or "file"
    return base[:120]


def store_evidence_file(original_name: str, content: bytes, mime: str, doc_date: str | None = None) -> tuple[str, str]:
    """ファイルを data/evidence/YYYY/MM/ に保存し (相対パス, sha256) を返す."""
    digest = hashlib.sha256(content).hexdigest()
    d = None
    if doc_date:
        try:
            d = date_type.fromisoformat(doc_date)
        except ValueError:
            d = None
    d = d or date_type.today()
    folder = config.EVIDENCE_DIR / f"{d.year:04d}" / f"{d.month:02d}"
    folder.mkdir(parents=True, exist_ok=True)
    fname = f"{digest[:12]}_{safe_filename(original_name)}"
    path = folder / fname
    if not path.exists():
        path.write_bytes(content)
    return str(path.relative_to(config.EVIDENCE_DIR)), digest


def create_evidence(
    conn: sqlite3.Connection,
    *,
    original_name: str,
    content: bytes,
    mime: str,
    kind: str = "receipt",
    doc_date: str = "",
    vendor: str = "",
    amount: int | None = None,
    memo: str = "",
) -> dict[str, Any]:
    rel, digest = store_evidence_file(original_name, content, mime, doc_date or None)
    ts = now_str()
    cur = conn.execute(
        "INSERT INTO evidence(original_name, stored_path, mime, size, sha256, kind, doc_date, vendor, amount, memo,"
        " ocr_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (original_name, rel, mime, len(content), digest, kind if kind in EVIDENCE_KINDS else "other", doc_date,
         vendor, amount, memo, "none", ts, ts),
    )
    return get_evidence(conn, cur.lastrowid)


def find_duplicate_evidence(conn: sqlite3.Connection, content: bytes) -> dict[str, Any] | None:
    digest = hashlib.sha256(content).hexdigest()
    row = conn.execute("SELECT * FROM evidence WHERE sha256=?", (digest,)).fetchone()
    return _decorate_evidence(conn, dict(row)) if row else None


def _decorate_evidence(conn: sqlite3.Connection, ev: dict[str, Any]) -> dict[str, Any]:
    ev["kind_label"] = EVIDENCE_KINDS.get(ev["kind"], ev["kind"])
    ev["ocr"] = json.loads(ev["ocr_json"]) if ev.get("ocr_json") else None
    rows = conn.execute(
        "SELECT e.id, e.date, e.debit_account, e.credit_account, e.debit_amount, e.description FROM entry_evidence ee"
        " JOIN entries e ON e.id = ee.entry_id WHERE ee.evidence_id=? ORDER BY e.date",
        (ev["id"],),
    )
    ev["entries"] = rows_to_dicts(rows)
    inv = conn.execute("SELECT id, invoice_no, status FROM invoices WHERE evidence_id=?", (ev["id"],)).fetchone()
    ev["invoice"] = row_to_dict(inv)
    ev["linked"] = bool(ev["entries"]) or bool(inv)
    return ev


def get_evidence(conn: sqlite3.Connection, evidence_id: int) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    if row is None:
        raise KeyError(evidence_id)
    return _decorate_evidence(conn, dict(row))


def list_evidence(
    conn: sqlite3.Connection,
    *,
    kind: str | None = None,
    year: int | None = None,
    month: int | None = None,
    linked: bool | None = None,
    q: str | None = None,
    amount_min: int | None = None,
    amount_max: int | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    where: list[str] = []
    params: list[Any] = []
    if kind:
        where.append("kind=?")
        params.append(kind)
    if year:
        where.append("substr(COALESCE(NULLIF(doc_date,''), created_at),1,4)=?")
        params.append(f"{year:04d}")
    if month:
        where.append("substr(COALESCE(NULLIF(doc_date,''), created_at),6,2)=?")
        params.append(f"{month:02d}")
    if linked is True:
        where.append("(id IN (SELECT evidence_id FROM entry_evidence) OR id IN (SELECT evidence_id FROM invoices WHERE evidence_id IS NOT NULL))")
    elif linked is False:
        where.append("(id NOT IN (SELECT evidence_id FROM entry_evidence) AND id NOT IN (SELECT evidence_id FROM invoices WHERE evidence_id IS NOT NULL))")
    if q:
        like = f"%{q}%"
        where.append("(vendor LIKE ? OR original_name LIKE ? OR memo LIKE ? OR ocr_json LIKE ?)")
        params += [like] * 4
    if amount_min is not None:
        where.append("amount>=?")
        params.append(amount_min)
    if amount_max is not None:
        where.append("amount<=?")
        params.append(amount_max)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM evidence{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM evidence{clause} ORDER BY COALESCE(NULLIF(doc_date,''), created_at) DESC, id DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return {"items": [_decorate_evidence(conn, dict(r)) for r in rows], "total": total}


def update_evidence(conn: sqlite3.Connection, evidence_id: int, fields: dict[str, Any]) -> dict[str, Any]:
    allowed = {"kind", "doc_date", "vendor", "amount", "memo", "ocr_status", "ocr_provider", "ocr_json", "ocr_error"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "kind" in updates and updates["kind"] not in EVIDENCE_KINDS:
        updates["kind"] = "other"
    if updates:
        updates["updated_at"] = now_str()
        assignments = ", ".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE evidence SET {assignments} WHERE id=?", [*updates.values(), evidence_id])
    return get_evidence(conn, evidence_id)


def delete_evidence(conn: sqlite3.Connection, evidence_id: int) -> None:
    row = conn.execute("SELECT stored_path FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    if row is None:
        raise KeyError(evidence_id)
    conn.execute("DELETE FROM evidence WHERE id=?", (evidence_id,))
    conn.execute("UPDATE invoices SET evidence_id=NULL WHERE evidence_id=?", (evidence_id,))
    still_used = conn.execute("SELECT 1 FROM evidence WHERE stored_path=?", (row["stored_path"],)).fetchone()
    if not still_used:
        path = config.EVIDENCE_DIR / row["stored_path"]
        if path.exists():
            path.unlink()


def evidence_abs_path(ev: dict[str, Any]) -> Path:
    return config.EVIDENCE_DIR / ev["stored_path"]


# ----------------------------------------------------------------- 請求書
def calc_invoice_totals(items: list[dict[str, Any]]) -> tuple[int, int, int, dict[int, dict[str, int]]]:
    """明細から (税抜合計, 消費税, 税込合計, 税率別内訳) を計算する（税抜表示・税率ごとに切り捨て）."""
    by_rate: dict[int, dict[str, int]] = {}
    for it in items:
        rate = int(it.get("tax_rate", 10) or 0)
        line = int(round(float(it.get("quantity", 1) or 0) * int(it.get("unit_price", 0) or 0)))
        by_rate.setdefault(rate, {"net": 0, "tax": 0})["net"] += line
    subtotal = 0
    tax = 0
    for rate, agg in by_rate.items():
        agg["tax"] = agg["net"] * rate // 100
        subtotal += agg["net"]
        tax += agg["tax"]
    return subtotal, tax, subtotal + tax, by_rate


def next_invoice_no(conn: sqlite3.Connection, prefix: str, issue_date: str) -> str:
    year = issue_date[:4]
    base = f"{prefix}{year}-"
    rows = conn.execute("SELECT invoice_no FROM invoices WHERE invoice_no LIKE ?", (base + "%",)).fetchall()
    max_n = 0
    for r in rows:
        tail = r["invoice_no"][len(base):]
        if tail.isdigit():
            max_n = max(max_n, int(tail))
    return f"{base}{max_n + 1:04d}"


def get_invoice(conn: sqlite3.Connection, invoice_id: int) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if row is None:
        raise KeyError(invoice_id)
    inv = dict(row)
    inv["items"] = json.loads(inv.pop("items_json") or "[]")
    _, _, _, by_rate = calc_invoice_totals(inv["items"])
    inv["tax_breakdown"] = {str(k): v for k, v in by_rate.items()}
    return inv


def list_invoices(conn: sqlite3.Connection, *, year: int | None = None, status: str | None = None) -> list[dict[str, Any]]:
    where = []
    params: list[Any] = []
    if year:
        where.append("substr(issue_date,1,4)=?")
        params.append(f"{year:04d}")
    if status:
        where.append("status=?")
        params.append(status)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(f"SELECT id FROM invoices{clause} ORDER BY issue_date DESC, id DESC", params).fetchall()
    return [get_invoice(conn, r["id"]) for r in rows]


def save_invoice(conn: sqlite3.Connection, data: InvoiceIn, settings: dict[str, Any], invoice_id: int | None = None) -> dict[str, Any]:
    items = [i.model_dump() for i in data.items]
    subtotal, tax, total, _ = calc_invoice_totals(items)
    ts = now_str()
    if invoice_id is None:
        invoice_no = data.invoice_no or next_invoice_no(conn, settings.get("invoice_prefix", "INV-"), data.issue_date)
        cur = conn.execute(
            "INSERT INTO invoices(invoice_no, partner_name, partner_address, issue_date, due_date, subject, items_json,"
            " subtotal, tax, total, status, paid_date, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (invoice_no, data.partner_name, data.partner_address, data.issue_date, data.due_date, data.subject,
             json.dumps(items, ensure_ascii=False), subtotal, tax, total, "draft", "", data.note, ts, ts),
        )
        invoice_id = cur.lastrowid
    else:
        current = get_invoice(conn, invoice_id)
        invoice_no = data.invoice_no or current["invoice_no"]
        conn.execute(
            "UPDATE invoices SET invoice_no=?, partner_name=?, partner_address=?, issue_date=?, due_date=?, subject=?,"
            " items_json=?, subtotal=?, tax=?, total=?, note=?, updated_at=? WHERE id=?",
            (invoice_no, data.partner_name, data.partner_address, data.issue_date, data.due_date, data.subject,
             json.dumps(items, ensure_ascii=False), subtotal, tax, total, data.note, ts, invoice_id),
        )
        # 発行済みなら売上仕訳の金額を追従させる
        if current.get("sale_entry_id"):
            _sync_sale_entry(conn, get_invoice(conn, invoice_id), settings)
    ensure_partner(conn, data.partner_name)
    return get_invoice(conn, invoice_id)


def _sale_tax_category(by_rate: dict) -> str:
    rates = {int(r) for r in by_rate.keys()}
    if rates == {8}:
        return "課税売上8%（軽）"
    if rates == {0}:
        return "非課売上"
    return "課税売上10%"


def _sync_sale_entry(conn: sqlite3.Connection, inv: dict[str, Any], settings: dict[str, Any]) -> int:
    _, _, _, by_rate = calc_invoice_totals(inv["items"])
    entry = EntryIn(
        date=inv["issue_date"],
        debit_account=settings.get("default_debit_account_for_sales", "売掛金"),
        debit_amount=inv["total"],
        debit_tax_category="対象外",
        debit_partner=inv["partner_name"],
        credit_account="売上高",
        credit_tax_category=_sale_tax_category(by_rate),
        credit_partner=inv["partner_name"],
        description=f"請求書 {inv['invoice_no']} {inv.get('subject') or ''}".strip(),
        source="invoice",
        evidence_ids=[inv["evidence_id"]] if inv.get("evidence_id") else [],
    )
    if inv.get("sale_entry_id"):
        try:
            update_entry(conn, inv["sale_entry_id"], entry)
            return inv["sale_entry_id"]
        except KeyError:
            pass
    created = create_entry(conn, entry)
    conn.execute("UPDATE invoices SET sale_entry_id=? WHERE id=?", (created["id"], inv["id"]))
    return created["id"]


def set_invoice_status(
    conn: sqlite3.Connection,
    invoice_id: int,
    *,
    status: str,
    settings: dict[str, Any],
    paid_date: str = "",
    deposit_account: str | None = None,
    fee_amount: int = 0,
) -> dict[str, Any]:
    inv = get_invoice(conn, invoice_id)
    ts = now_str()
    if status == "draft":
        for key in ("sale_entry_id", "payment_entry_id", "fee_entry_id"):
            if inv.get(key):
                delete_entry(conn, inv[key])
        conn.execute("UPDATE invoices SET status='draft', paid_date='', sale_entry_id=NULL, payment_entry_id=NULL,"
                     " fee_entry_id=NULL, updated_at=? WHERE id=?", (ts, invoice_id))
    elif status == "issued":
        _sync_sale_entry(conn, inv, settings)
        for key in ("payment_entry_id", "fee_entry_id"):
            if inv.get(key):
                delete_entry(conn, inv[key])
        conn.execute("UPDATE invoices SET status='issued', paid_date='', payment_entry_id=NULL, fee_entry_id=NULL,"
                     " updated_at=? WHERE id=?", (ts, invoice_id))
    elif status == "paid":
        _sync_sale_entry(conn, inv, settings)
        paid_date = paid_date or date_type.today().isoformat()
        deposit = deposit_account or settings.get("default_deposit_account", "普通預金")
        receivable = settings.get("default_debit_account_for_sales", "売掛金")
        fee = max(0, int(fee_amount or 0))
        entries: list[EntryIn] = [
            EntryIn(
                date=paid_date,
                debit_account=deposit,
                debit_amount=inv["total"] - fee,
                debit_tax_category="対象外",
                credit_account=receivable,
                credit_amount=inv["total"] - fee,
                credit_tax_category="対象外",
                credit_partner=inv["partner_name"],
                description=f"請求書 {inv['invoice_no']} 入金",
                source="invoice",
            )
        ]
        if fee:
            entries.append(
                EntryIn(
                    date=paid_date,
                    debit_account="支払手数料",
                    debit_amount=fee,
                    credit_account=receivable,
                    credit_amount=fee,
                    credit_tax_category="対象外",
                    credit_partner=inv["partner_name"],
                    description=f"請求書 {inv['invoice_no']} 振込手数料",
                    source="invoice",
                )
            )
        for key in ("payment_entry_id", "fee_entry_id"):
            if inv.get(key):
                delete_entry(conn, inv[key])
        created = [create_entry(conn, e) for e in entries]
        fee_entry_id = created[1]["id"] if len(created) > 1 else None
        conn.execute("UPDATE invoices SET status='paid', paid_date=?, payment_entry_id=?, fee_entry_id=?, updated_at=?"
                     " WHERE id=?", (paid_date, created[0]["id"], fee_entry_id, ts, invoice_id))
    return get_invoice(conn, invoice_id)


def delete_invoice(conn: sqlite3.Connection, invoice_id: int) -> None:
    inv = get_invoice(conn, invoice_id)
    for key in ("sale_entry_id", "payment_entry_id", "fee_entry_id"):
        if inv.get(key):
            delete_entry(conn, inv[key])
    conn.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))


# ------------------------------------------------------------------ 集計
def report_summary(conn: sqlite3.Connection, year: int) -> dict[str, Any]:
    accounts = account_map(conn)
    y = f"{year:04d}"
    rows = conn.execute("SELECT * FROM entries WHERE substr(date,1,4)=?", (y,)).fetchall()
    months = {f"{m:02d}": {"revenue": 0, "expense": 0} for m in range(1, 13)}
    by_account: dict[str, dict[str, Any]] = {}

    def bump(name: str | None, amount: int, side: str, month: str) -> None:
        if not name:
            return
        cat = accounts.get(name, {}).get("category", "expense")
        rec = by_account.setdefault(name, {"account": name, "category": cat, "debit": 0, "credit": 0, "net": 0})
        rec[side] += amount
        # 収益は貸方が増加、費用は借方が増加
        if cat == "revenue":
            delta = amount if side == "credit" else -amount
            rec["net"] += delta
            months[month]["revenue"] += delta
        elif cat == "expense":
            delta = amount if side == "debit" else -amount
            rec["net"] += delta
            months[month]["expense"] += delta
        else:
            rec["net"] += amount if side == "debit" else -amount

    for r in rows:
        month = r["date"][5:7]
        bump(r["debit_account"], r["debit_amount"], "debit", month)
        bump(r["credit_account"], r["credit_amount"], "credit", month)

    revenue_total = sum(v["net"] for v in by_account.values() if v["category"] == "revenue")
    expense_total = sum(v["net"] for v in by_account.values() if v["category"] == "expense")
    order = {name: i for i, name in enumerate(accounts)}
    accounts_sorted = sorted(by_account.values(), key=lambda v: (["revenue", "expense", "asset", "liability", "equity"].index(v["category"]), order.get(v["account"], 999)))
    unlinked = conn.execute(
        "SELECT COUNT(*) FROM evidence WHERE id NOT IN (SELECT evidence_id FROM entry_evidence)"
        " AND id NOT IN (SELECT evidence_id FROM invoices WHERE evidence_id IS NOT NULL)"
    ).fetchone()[0]
    unpaid = conn.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM invoices WHERE status='issued'").fetchone()
    return {
        "year": year,
        "revenue_total": revenue_total,
        "expense_total": expense_total,
        "profit": revenue_total - expense_total,
        "entry_count": len(rows),
        "months": [{"month": m, **v, "profit": v["revenue"] - v["expense"]} for m, v in months.items()],
        "accounts": accounts_sorted,
        "unlinked_evidence": unlinked,
        "unpaid_invoices": {"count": unpaid[0], "total": unpaid[1]},
    }


def report_partners(conn: sqlite3.Connection, year: int) -> list[dict[str, Any]]:
    accounts = account_map(conn)
    y = f"{year:04d}"
    agg: dict[str, dict[str, int]] = {}
    for r in conn.execute("SELECT * FROM entries WHERE substr(date,1,4)=?", (y,)):
        for side in ("debit", "credit"):
            name = r[f"{side}_partner"]
            acct = r[f"{side}_account"]
            if not name or not acct:
                continue
            cat = accounts.get(acct, {}).get("category")
            rec = agg.setdefault(name, {"partner": name, "sales": 0, "expenses": 0})
            if cat == "revenue" and side == "credit":
                rec["sales"] += r["credit_amount"]
            elif cat == "expense" and side == "debit":
                rec["expenses"] += r["debit_amount"]
    return sorted(agg.values(), key=lambda v: -(v["sales"] + v["expenses"]))
