"""集計・エクスポート・インポート・バックアップ."""

from __future__ import annotations

import csv
import io
import shutil
import tempfile
import zipfile
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .. import config, services
from ..db import get_conn
from ..freee_csv import export_csv, import_csv

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports/summary")
def summary(year: Optional[int] = None):
    year = year or config.load_settings().get("fiscal_year") or date.today().year
    with get_conn() as conn:
        return services.report_summary(conn, int(year))


@router.get("/reports/partners")
def partners_report(year: Optional[int] = None):
    year = year or config.load_settings().get("fiscal_year") or date.today().year
    with get_conn() as conn:
        return services.report_partners(conn, int(year))


def _csv_response(text: str, filename: str) -> Response:
    from urllib.parse import quote

    return Response(
        content=text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/export/freee")
def export_freee(year: Optional[int] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, bom: bool = False):
    settings = config.load_settings()
    with get_conn() as conn:
        text = export_csv(conn, settings, year=year, date_from=date_from, date_to=date_to)
    if bom:
        text = "﻿" + text
    label = f"{year}_01_{year}_12" if year else f"{date_from or 'all'}_{date_to or 'all'}"
    return _csv_response(text, f"仕訳帳CSV_{label}.csv")


@router.get("/export/evidence-index")
def export_evidence_index(year: Optional[int] = None):
    """電子帳簿保存法向けの索引簿（日付・金額・取引先で検索できる一覧）."""
    with get_conn() as conn:
        data = services.list_evidence(conn, year=year, limit=100000)
    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\n")
    w.writerow(["連番", "取引日", "金額", "取引先", "書類種別", "ファイル名", "保存パス", "SHA-256", "紐づく仕訳ID", "登録日時", "メモ"])
    for i, ev in enumerate(data["items"], start=1):
        w.writerow([
            i, ev.get("doc_date", ""), ev.get("amount") if ev.get("amount") is not None else "", ev.get("vendor", ""),
            ev.get("kind_label", ""), ev.get("original_name", ""), f"evidence/{ev['stored_path']}", ev.get("sha256", ""),
            " ".join(str(e["id"]) for e in ev.get("entries", [])), ev.get("created_at", ""), ev.get("memo", ""),
        ])
    return _csv_response("﻿" + buf.getvalue(), f"証跡索引簿_{year or 'all'}.csv")


@router.post("/import/freee")
async def import_freee(file: UploadFile = File(...), skip_duplicates: bool = True):
    raw = await file.read()
    text = None
    for enc in ("utf-8-sig", "cp932", "shift_jis", "euc_jp"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise HTTPException(400, "文字コードを判定できませんでした（UTF-8 / Shift_JIS に対応）")
    with get_conn() as conn:
        try:
            return import_csv(conn, text, skip_duplicates=skip_duplicates)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@router.get("/backup")
def backup():
    """DB・証跡・設定をまとめた ZIP を返す."""
    config.ensure_dirs()
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
        if config.DB_PATH.exists():
            # WAL を含めて安全にコピーするため sqlite backup API を使う
            import sqlite3

            snap = Path(tmp.name + ".db")
            src = sqlite3.connect(str(config.DB_PATH))
            dst = sqlite3.connect(str(snap))
            src.backup(dst)
            dst.close()
            src.close()
            zf.write(snap, "kaikei.db")
            snap.unlink()
        if config.SETTINGS_PATH.exists():
            zf.write(config.SETTINGS_PATH, "settings.json")
        for p in config.EVIDENCE_DIR.rglob("*"):
            if p.is_file():
                zf.write(p, f"evidence/{p.relative_to(config.EVIDENCE_DIR)}")
    data = Path(tmp.name).read_bytes()
    Path(tmp.name).unlink()
    name = f"kaikei_backup_{date.today().isoformat()}.zip"
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={name}"})
