"""freee 仕訳帳CSV（97列）のエクスポート／インポート.

添付されていた freee のエクスポートファイルとまったく同じヘッダ・並び・引用符付けで出力する。
  - 文字コード UTF-8（BOMなし）、改行 LF、全フィールドをダブルクォートで囲む
  - 税額は内税・切り捨て（app.tax）
"""

from __future__ import annotations

import csv
import io
import sqlite3
from typing import Any, Iterable

from .models import EntryIn
from .services import account_map, create_entry, ensure_account
from .tax import normalize_tax_name, tax_info

HEADERS: list[str] = [
    "No", "取引日", "管理番号",
    # 借方
    "借方勘定科目", "借方決算書表示名", "借方勘定科目ショートカット１", "借方勘定科目ショートカット２（勘定科目コード）",
    "借方金額", "借方税区分", "借方税金額", "借方内税・外税", "借方税率", "借方軽減税率有無",
    "借方取引先コード", "借方取引先名", "借方取引先ショートカット１", "借方取引先ショートカット２",
    "借方品目", "借方品目ショートカット１", "借方品目ショートカット２",
    "借方部門", "借方部門ショートカット１", "借方部門ショートカット２",
    "借方メモ", "借方メモショートカット１", "借方メモショートカット２",
    "借方セグメント１", "借方セグメント１ショートカット１", "借方セグメント１ショートカット２",
    "借方セグメント２", "借方セグメント２ショートカット１", "借方セグメント２ショートカット２",
    "借方セグメント３", "借方セグメント３ショートカット１", "借方セグメント３ショートカット２",
    "借方備考",
    # 貸方
    "貸方勘定科目", "貸方決算書表示名", "貸方勘定科目ショートカット１", "貸方勘定科目ショートカット２（勘定科目コード）",
    "貸方金額", "貸方税区分", "貸方税金額", "貸方内税・外税", "貸方税率", "貸方軽減税率有無",
    "貸方取引先コード", "貸方取引先名", "貸方取引先ショートカット１", "貸方取引先ショートカット２",
    "貸方品目", "貸方品目ショートカット１", "貸方品目ショートカット２",
    "貸方部門", "貸方部門ショートカット１", "貸方部門ショートカット２",
    "貸方メモ", "貸方メモショートカット１", "貸方メモショートカット２",
    "貸方セグメント１", "貸方セグメント１ショートカット１", "貸方セグメント１ショートカット２",
    "貸方セグメント２", "貸方セグメント２ショートカット１", "貸方セグメント２ショートカット２",
    "貸方セグメント３", "貸方セグメント３ショートカット１", "貸方セグメント３ショートカット２",
    "貸方備考",
    # 共通
    "決算整理仕訳", "発行元", "作成日時", "更新日時",
    "承認状況(仕訳承認)", "申請者(仕訳承認)", "申請日時(仕訳承認)", "承認者(仕訳承認)", "承認日時(仕訳承認)",
    "作成者", "消費税経理処理方法", "取引ID", "口座振替ID", "振替伝票ID", "仕訳ID", "仕訳番号",
    "期末日取引フラグ", "取引支払日", "仕訳行番号", "仕訳行数", "レコード番号", "取引内容", "登録した方法",
    "経費精算 申請番号", "支払依頼 申請番号", "ファイル番号", "一次承認者(仕訳承認)", "一次承認日時(仕訳承認)",
]
COL = {h: i for i, h in enumerate(HEADERS)}
assert len(HEADERS) == 97


def _fmt_ts(ts: str) -> str:
    """'2026-08-23 18:10:05' -> '2026-08-23 18:10'（freee の書式）."""
    return (ts or "")[:16]


def _side_columns(entry: dict[str, Any], side: str, prefix: str, accounts: dict[str, dict[str, Any]], partners: dict[str, dict[str, Any]]) -> dict[str, str]:
    name = entry.get(f"{side}_account") or ""
    acct = accounts.get(name, {})
    tax_cat = entry.get(f"{side}_tax_category") or "対象外"
    tinfo = tax_info(tax_cat)
    partner_name = entry.get(f"{side}_partner") or ""
    partner = partners.get(partner_name, {})
    cols = {
        f"{prefix}勘定科目": name,
        f"{prefix}決算書表示名": acct.get("display_name") or name,
        f"{prefix}勘定科目ショートカット１": acct.get("shortcut1", "") if name else "",
        f"{prefix}勘定科目ショートカット２（勘定科目コード）": acct.get("code", "") if name else "",
        f"{prefix}金額": str(entry.get(f"{side}_amount") or 0) if name else "",
        f"{prefix}税区分": normalize_tax_name(tax_cat) if name else "",
        f"{prefix}税金額": str(entry.get(f"{side}_tax_amount") or 0) if name else "",
        f"{prefix}内税・外税": "内税" if name else "",
        f"{prefix}税率": str(tinfo.rate) if name else "",
        f"{prefix}軽減税率有無": ("1" if tinfo.reduced else "0") if name else "",
        f"{prefix}取引先コード": partner.get("code", "") if partner_name else "",
        f"{prefix}取引先名": partner_name,
        f"{prefix}品目": entry.get(f"{side}_item") or "",
        f"{prefix}メモ": entry.get(f"{side}_memo") or "",
        f"{prefix}備考": entry.get(f"{side}_note") or "",
    }
    return cols


def entries_to_rows(entries: Iterable[dict[str, Any]], accounts: dict[str, dict[str, Any]], partners: dict[str, dict[str, Any]], settings: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []
    creator = settings.get("owner_email") or settings.get("owner_name") or ""
    tax_method = settings.get("tax_method") or "税込経理"
    for n, e in enumerate(entries, start=1):
        row = [""] * len(HEADERS)
        row[COL["No"]] = str(n)
        row[COL["取引日"]] = e["date"]
        for key, val in _side_columns(e, "debit", "借方", accounts, partners).items():
            row[COL[key]] = val
        for key, val in _side_columns(e, "credit", "貸方", accounts, partners).items():
            row[COL[key]] = val
        row[COL["決算整理仕訳"]] = "1" if e.get("adjustment_flag") else "0"
        row[COL["作成日時"]] = _fmt_ts(e.get("created_at", ""))
        row[COL["更新日時"]] = _fmt_ts(e.get("updated_at", ""))
        row[COL["承認状況(仕訳承認)"]] = "なし"
        row[COL["作成者"]] = creator
        row[COL["消費税経理処理方法"]] = tax_method
        row[COL["取引ID"]] = e.get("external_id") or str(e["id"])
        row[COL["仕訳ID"]] = e.get("group_key") or str(e["id"])
        row[COL["期末日取引フラグ"]] = "1" if e.get("closing_flag") else "0"
        row[COL["取引支払日"]] = e.get("payment_date") or ""
        row[COL["仕訳行番号"]] = str(e.get("line_no") or 1)
        row[COL["仕訳行数"]] = str(e.get("line_count") or 1)
        row[COL["レコード番号"]] = str(n)
        row[COL["取引内容"]] = e.get("description") or ""
        row[COL["登録した方法"]] = "手動"
        rows.append(row)
    return rows


def export_csv(conn: sqlite3.Connection, settings: dict[str, Any], *, year: int | None = None, date_from: str | None = None, date_to: str | None = None) -> str:
    where = []
    params: list[Any] = []
    if year:
        where.append("substr(date,1,4)=?")
        params.append(f"{year:04d}")
    if date_from:
        where.append("date>=?")
        params.append(date_from)
    if date_to:
        where.append("date<=?")
        params.append(date_to)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    entries = [dict(r) for r in conn.execute(f"SELECT * FROM entries{clause} ORDER BY date, id", params)]
    accounts = account_map(conn)
    partners = {r["name"]: dict(r) for r in conn.execute("SELECT * FROM partners")}
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(HEADERS)
    writer.writerows(entries_to_rows(entries, accounts, partners, settings))
    return buf.getvalue()


# ------------------------------------------------------------------ import
def parse_csv(text: str) -> list[dict[str, str]]:
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    header = next(reader, None)
    if not header:
        return []
    header = [h.strip() for h in header]
    required = {"取引日", "借方勘定科目", "貸方勘定科目", "借方金額", "貸方金額"}
    if not required <= set(header):
        raise ValueError("freee 仕訳帳CSV の形式ではありません（必要な列: " + ", ".join(sorted(required)) + "）")
    rows = []
    for raw in reader:
        if not any(cell.strip() for cell in raw):
            continue
        rows.append({header[i]: (raw[i] if i < len(raw) else "") for i in range(len(header))})
    return rows


def _to_int(s: str) -> int:
    s = (s or "").replace(",", "").strip()
    try:
        return int(float(s)) if s else 0
    except ValueError:
        return 0


def import_csv(conn: sqlite3.Connection, text: str, *, skip_duplicates: bool = True) -> dict[str, Any]:
    rows = parse_csv(text)
    imported = 0
    skipped = 0
    errors: list[str] = []
    existing = {
        (r["external_id"], r["group_key"], r["line_no"])
        for r in conn.execute("SELECT external_id, group_key, line_no FROM entries WHERE external_id<>'' OR group_key<>''")
    }
    for idx, r in enumerate(rows, start=2):
        try:
            ext_id = (r.get("取引ID") or "").strip()
            group = (r.get("仕訳ID") or "").strip()
            line_no = _to_int(r.get("仕訳行番号", "1")) or 1
            key = (ext_id, group, line_no)
            if skip_duplicates and (ext_id or group) and key in existing:
                skipped += 1
                continue
            debit = r.get("借方勘定科目", "").strip() or None
            credit = r.get("貸方勘定科目", "").strip() or None
            if not debit and not credit:
                skipped += 1
                continue
            # 未知の科目は自動登録（表示名・ショートカット・コードも取り込む）
            for side, name in (("借方", debit), ("貸方", credit)):
                if name:
                    ensure_account(conn, name, _guess_category(name))
                    conn.execute(
                        "UPDATE accounts SET display_name=COALESCE(NULLIF(?, ''), display_name),"
                        " shortcut1=CASE WHEN shortcut1='' THEN ? ELSE shortcut1 END,"
                        " code=CASE WHEN code='' THEN ? ELSE code END WHERE name=?",
                        (r.get(f"{side}決算書表示名", ""), r.get(f"{side}勘定科目ショートカット１", ""),
                         r.get(f"{side}勘定科目ショートカット２（勘定科目コード）", ""), name),
                    )
            debit_amount = _to_int(r.get("借方金額", "")) if debit else 0
            credit_amount = _to_int(r.get("貸方金額", "")) if credit else 0
            data = EntryIn(
                date=r["取引日"].strip()[:10].replace("/", "-"),
                debit_account=debit,
                debit_amount=debit_amount,
                debit_tax_category=r.get("借方税区分") or None,
                debit_partner=r.get("借方取引先名", ""),
                debit_item=r.get("借方品目", ""),
                debit_memo=r.get("借方メモ", ""),
                debit_note=r.get("借方備考", ""),
                credit_account=credit,
                credit_amount=credit_amount,
                credit_tax_category=r.get("貸方税区分") or None,
                credit_partner=r.get("貸方取引先名", ""),
                credit_item=r.get("貸方品目", ""),
                credit_memo=r.get("貸方メモ", ""),
                credit_note=r.get("貸方備考", ""),
                description=r.get("取引内容", ""),
                payment_date=r.get("取引支払日", ""),
                closing_flag=r.get("期末日取引フラグ", "0") == "1",
                adjustment_flag=r.get("決算整理仕訳", "0") == "1",
                source="import",
            )
            created = create_entry(conn, data)
            # freee 側の税額・行番号・IDを保持
            conn.execute(
                "UPDATE entries SET debit_tax_amount=?, credit_tax_amount=?, line_no=?, line_count=?, external_id=?,"
                " group_key=? WHERE id=?",
                (
                    _to_int(r.get("借方税金額", "")) if debit else 0,
                    _to_int(r.get("貸方税金額", "")) if credit else 0,
                    line_no,
                    _to_int(r.get("仕訳行数", "1")) or 1,
                    ext_id,
                    group,
                    created["id"],
                ),
            )
            existing.add(key)
            imported += 1
        except Exception as exc:  # noqa: BLE001 - 行単位でエラーを集めて続行
            errors.append(f"{idx}行目: {exc}")
    return {"imported": imported, "skipped": skipped, "errors": errors, "rows": len(rows)}


def _guess_category(name: str) -> str:
    if name in ("事業主借", "元入金"):
        return "equity"
    if any(k in name for k in ("売上", "収入", "受取")):
        return "revenue"
    if any(k in name for k in ("預金", "現金", "売掛", "未収", "事業主貸", "前払", "立替", "仮払", "備品", "車両運搬", "貯蔵")):
        return "asset"
    if any(k in name for k in ("買掛", "未払", "預り", "借入", "前受", "仮受")):
        return "liability"
    return "expense"
