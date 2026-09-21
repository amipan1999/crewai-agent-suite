"""SQLite アクセス層.

標準ライブラリの sqlite3 だけで完結させ、依存を最小にしている。
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

from . import config
from .accounts import DEFAULT_ACCOUNTS

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    shortcut1 TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    default_tax_category TEXT NOT NULL DEFAULT '対象外',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'both',
    registration_number TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    debit_account TEXT,
    debit_amount INTEGER NOT NULL DEFAULT 0,
    debit_tax_category TEXT NOT NULL DEFAULT '対象外',
    debit_tax_amount INTEGER NOT NULL DEFAULT 0,
    debit_partner TEXT NOT NULL DEFAULT '',
    debit_item TEXT NOT NULL DEFAULT '',
    debit_memo TEXT NOT NULL DEFAULT '',
    debit_note TEXT NOT NULL DEFAULT '',
    credit_account TEXT,
    credit_amount INTEGER NOT NULL DEFAULT 0,
    credit_tax_category TEXT NOT NULL DEFAULT '対象外',
    credit_tax_amount INTEGER NOT NULL DEFAULT 0,
    credit_partner TEXT NOT NULL DEFAULT '',
    credit_item TEXT NOT NULL DEFAULT '',
    credit_memo TEXT NOT NULL DEFAULT '',
    credit_note TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL DEFAULT '',
    closing_flag INTEGER NOT NULL DEFAULT 0,
    adjustment_flag INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    group_key TEXT NOT NULL DEFAULT '',
    line_no INTEGER NOT NULL DEFAULT 1,
    line_count INTEGER NOT NULL DEFAULT 1,
    external_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'receipt',
    doc_date TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL DEFAULT '',
    amount INTEGER,
    memo TEXT NOT NULL DEFAULT '',
    ocr_status TEXT NOT NULL DEFAULT 'none',
    ocr_provider TEXT NOT NULL DEFAULT '',
    ocr_json TEXT NOT NULL DEFAULT '',
    ocr_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_sha ON evidence(sha256);

CREATE TABLE IF NOT EXISTS entry_evidence (
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL UNIQUE,
    partner_name TEXT NOT NULL,
    partner_address TEXT NOT NULL DEFAULT '',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    items_json TEXT NOT NULL DEFAULT '[]',
    subtotal INTEGER NOT NULL DEFAULT 0,
    tax INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    paid_date TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    sale_entry_id INTEGER,
    payment_entry_id INTEGER,
    fee_entry_id INTEGER,
    evidence_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect(db_path=None) -> sqlite3.Connection:
    config.ensure_dirs()
    conn = sqlite3.connect(str(db_path or config.DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db(db_path=None) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)
        seed_accounts(conn)


def seed_accounts(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    if count:
        return
    conn.executemany(
        "INSERT INTO accounts(name, display_name, shortcut1, code, category, default_tax_category, sort_order)"
        " VALUES (?,?,?,?,?,?,?)",
        [(a[0], a[1], a[2], a[3], a[4], a[5], i * 10) for i, a in enumerate(DEFAULT_ACCOUNTS)],
    )


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rows_to_dicts(rows) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def row_to_dict(row) -> dict[str, Any] | None:
    return dict(row) if row is not None else None
