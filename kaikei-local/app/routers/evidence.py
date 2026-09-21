"""証跡（領収書・請求書などのファイル）API."""

from __future__ import annotations

import io
import json
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response

from .. import config, services
from ..db import get_conn, rows_to_dicts
from ..models import EntryIn, EvidenceUpdate, OcrApplyIn
from ..ocr import OcrError, run_ocr

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif", "image/bmp", "image/tiff",
    "application/pdf",
}
MAX_SIZE = 30 * 1024 * 1024


def _guess_mime(upload: UploadFile) -> str:
    mime = (upload.content_type or "").lower()
    name = (upload.filename or "").lower()
    if mime in ALLOWED_MIME:
        return mime
    for ext, m in ((".pdf", "application/pdf"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg"), (".png", "image/png"),
                   (".gif", "image/gif"), (".webp", "image/webp"), (".heic", "image/heic"), (".bmp", "image/bmp"), (".tif", "image/tiff"), (".tiff", "image/tiff")):
        if name.endswith(ext):
            return m
    return mime or "application/octet-stream"


def _do_ocr(conn, ev: dict, provider: str | None = None) -> dict:
    settings = config.load_settings()
    accounts = rows_to_dicts(conn.execute("SELECT * FROM accounts WHERE is_active=1 ORDER BY sort_order"))
    try:
        result = run_ocr(path=str(services.evidence_abs_path(ev)), mime=ev["mime"], settings=settings, accounts=accounts, provider=provider)
    except OcrError as exc:
        services.update_evidence(conn, ev["id"], {"ocr_status": "error", "ocr_error": str(exc)})
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        services.update_evidence(conn, ev["id"], {"ocr_status": "error", "ocr_error": f"{type(exc).__name__}: {exc}"})
        raise HTTPException(500, f"OCR に失敗しました: {exc}") from exc
    fields = {
        "ocr_status": "done",
        "ocr_provider": result.get("provider", ""),
        "ocr_json": json.dumps(result, ensure_ascii=False),
        "ocr_error": "",
    }
    # 空欄のメタ情報は OCR 結果で補完
    if not ev.get("doc_date") and result.get("date"):
        fields["doc_date"] = result["date"]
    if not ev.get("vendor") and result.get("vendor"):
        fields["vendor"] = result["vendor"]
    if ev.get("amount") is None and result.get("total") is not None:
        fields["amount"] = result["total"]
    if ev.get("kind") == "receipt" and result.get("doc_type") in services.EVIDENCE_KINDS and result["doc_type"] != "receipt":
        fields["kind"] = result["doc_type"]
    return services.update_evidence(conn, ev["id"], fields)


@router.get("")
def list_evidence(
    kind: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    linked: Optional[bool] = None,
    q: Optional[str] = None,
    amount_min: Optional[int] = None,
    amount_max: Optional[int] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
):
    with get_conn() as conn:
        return services.list_evidence(conn, kind=kind, year=year, month=month, linked=linked, q=q,
                                      amount_min=amount_min, amount_max=amount_max, limit=limit, offset=offset)


@router.post("", status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    kind: str = Form("receipt"),
    doc_date: str = Form(""),
    vendor: str = Form(""),
    memo: str = Form(""),
    run_ocr_now: bool = Form(False),
    allow_duplicate: bool = Form(False),
):
    content = await file.read()
    if not content:
        raise HTTPException(400, "空のファイルです")
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "ファイルサイズは 30MB までです")
    mime = _guess_mime(file)
    if mime not in ALLOWED_MIME:
        raise HTTPException(400, f"対応していない形式です: {mime}")
    with get_conn() as conn:
        dup = services.find_duplicate_evidence(conn, content)
        if dup and not allow_duplicate:
            return {"duplicate": True, "evidence": dup}
        ev = services.create_evidence(conn, original_name=file.filename or "file", content=content, mime=mime,
                                      kind=kind, doc_date=doc_date, vendor=vendor, memo=memo)
        settings = config.load_settings()
        ocr_error = None
        if run_ocr_now or settings.get("auto_ocr_on_upload"):
            provider = settings.get("ocr_provider", "none")
            key_missing = provider == "claude" and not config.resolve_api_key(settings)
            if provider != "none" and not key_missing:
                try:
                    ev = _do_ocr(conn, ev)
                except HTTPException as exc:
                    ocr_error = exc.detail
                    ev = services.get_evidence(conn, ev["id"])
        return {"duplicate": False, "evidence": ev, "ocr_error": ocr_error}


@router.get("/{evidence_id}")
def get_evidence(evidence_id: int):
    with get_conn() as conn:
        try:
            return services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc


@router.patch("/{evidence_id}")
def update_evidence(evidence_id: int, data: EvidenceUpdate):
    with get_conn() as conn:
        try:
            services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
        return services.update_evidence(conn, evidence_id, data.model_dump(exclude_unset=True))


@router.delete("/{evidence_id}")
def delete_evidence(evidence_id: int):
    with get_conn() as conn:
        try:
            services.delete_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
    return {"ok": True}


@router.get("/{evidence_id}/file")
def evidence_file(evidence_id: int, download: bool = False):
    with get_conn() as conn:
        try:
            ev = services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
    path = services.evidence_abs_path(ev)
    if not path.exists():
        raise HTTPException(404, "ファイルが見つかりません")
    headers = {}
    if download:
        from urllib.parse import quote

        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(ev['original_name'])}"
    return FileResponse(str(path), media_type=ev["mime"], headers=headers)


@router.get("/{evidence_id}/thumbnail")
def evidence_thumbnail(evidence_id: int, size: int = 320):
    with get_conn() as conn:
        try:
            ev = services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
    path = services.evidence_abs_path(ev)
    if not ev["mime"].startswith("image/"):
        raise HTTPException(404, "サムネイルなし")
    try:
        from PIL import Image, ImageOps

        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        img.thumbnail((size, size))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return Response(buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})
    except Exception:  # noqa: BLE001
        return FileResponse(str(path), media_type=ev["mime"])


@router.post("/{evidence_id}/ocr")
def ocr_evidence(evidence_id: int, provider: Optional[str] = None):
    with get_conn() as conn:
        try:
            ev = services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
        return _do_ocr(conn, ev, provider)


@router.post("/{evidence_id}/apply", status_code=201)
def apply_ocr(evidence_id: int, data: OcrApplyIn):
    """OCR 結果（＋画面での修正値）から仕訳を1件作成し、証跡を紐づける."""
    settings = config.load_settings()
    with get_conn() as conn:
        try:
            ev = services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "証跡が見つかりません") from exc
        ocr = ev.get("ocr") or {}
        amount = data.amount if data.amount is not None else (ocr.get("total") or ev.get("amount") or 0)
        if not amount:
            raise HTTPException(400, "金額を入力してください")
        date = data.date or ocr.get("date") or ev.get("doc_date")
        if not date:
            raise HTTPException(400, "取引日を入力してください")
        doc_type = ocr.get("doc_type") or ev.get("kind")
        if doc_type == "invoice_issued":
            debit = data.debit_account or settings.get("default_debit_account_for_sales", "売掛金")
            credit = data.credit_account or "売上高"
            debit_tax, credit_tax = "対象外", (data.tax_category or ocr.get("suggested_tax_category") or "課税売上10%")
        else:
            debit = data.debit_account or ocr.get("suggested_account") or "雑費"
            credit = data.credit_account or settings.get("default_credit_account", "事業主借")
            debit_tax, credit_tax = (data.tax_category or ocr.get("suggested_tax_category") or None), "対象外"
        partner = data.partner if data.partner is not None else (ocr.get("vendor") or ev.get("vendor") or "")
        entry = EntryIn(
            date=date,
            debit_account=debit,
            debit_amount=int(amount),
            debit_tax_category=debit_tax,
            debit_partner=partner,
            debit_item=data.item if data.item is not None else "",
            credit_account=credit,
            credit_tax_category=credit_tax,
            credit_partner=partner,
            description=data.description if data.description is not None else (ocr.get("description") or ""),
            source="ocr",
            evidence_ids=[evidence_id],
        )
        created = services.create_entry(conn, entry)
        # 証跡側の空欄メタ情報を仕訳の内容で補完（ギャラリーの検索・表示用）
        fill = {}
        if not ev.get("doc_date"):
            fill["doc_date"] = date
        if not ev.get("vendor") and partner:
            fill["vendor"] = partner
        if ev.get("amount") is None:
            fill["amount"] = int(amount)
        if fill:
            services.update_evidence(conn, evidence_id, fill)
        return {"entry": created, "evidence": services.get_evidence(conn, evidence_id)}
