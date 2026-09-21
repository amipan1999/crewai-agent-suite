"""発行請求書 API."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from .. import config, services
from ..db import get_conn
from ..models import InvoiceIn, InvoiceStatusIn

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("")
def list_invoices(year: Optional[int] = None, status: Optional[str] = None):
    with get_conn() as conn:
        return services.list_invoices(conn, year=year, status=status)


@router.post("", status_code=201)
def create_invoice(data: InvoiceIn):
    settings = config.load_settings()
    with get_conn() as conn:
        if data.invoice_no and conn.execute("SELECT 1 FROM invoices WHERE invoice_no=?", (data.invoice_no,)).fetchone():
            raise HTTPException(400, "同じ請求書番号が既にあります")
        inv = services.save_invoice(conn, data, settings)
        if data.status != "draft":
            inv = services.set_invoice_status(conn, inv["id"], status=data.status, settings=settings, paid_date=data.paid_date)
        return inv


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int):
    with get_conn() as conn:
        try:
            return services.get_invoice(conn, invoice_id)
        except KeyError as exc:
            raise HTTPException(404, "請求書が見つかりません") from exc


@router.put("/{invoice_id}")
def update_invoice(invoice_id: int, data: InvoiceIn):
    settings = config.load_settings()
    with get_conn() as conn:
        try:
            return services.save_invoice(conn, data, settings, invoice_id=invoice_id)
        except KeyError as exc:
            raise HTTPException(404, "請求書が見つかりません") from exc


@router.post("/{invoice_id}/status")
def set_status(invoice_id: int, data: InvoiceStatusIn):
    settings = config.load_settings()
    with get_conn() as conn:
        try:
            return services.set_invoice_status(conn, invoice_id, status=data.status, settings=settings,
                                               paid_date=data.paid_date, deposit_account=data.deposit_account,
                                               fee_amount=data.fee_amount)
        except KeyError as exc:
            raise HTTPException(404, "請求書が見つかりません") from exc


@router.post("/{invoice_id}/attach/{evidence_id}")
def attach_evidence(invoice_id: int, evidence_id: int):
    with get_conn() as conn:
        try:
            services.get_invoice(conn, invoice_id)
            services.get_evidence(conn, evidence_id)
        except KeyError as exc:
            raise HTTPException(404, "請求書または証跡が見つかりません") from exc
        conn.execute("UPDATE invoices SET evidence_id=? WHERE id=?", (evidence_id, invoice_id))
        conn.execute("UPDATE evidence SET kind='invoice_issued' WHERE id=? AND kind='receipt'", (evidence_id,))
        inv = services.get_invoice(conn, invoice_id)
        if inv.get("sale_entry_id"):
            conn.execute("INSERT OR IGNORE INTO entry_evidence(entry_id, evidence_id) VALUES (?,?)", (inv["sale_entry_id"], evidence_id))
        return inv


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int):
    with get_conn() as conn:
        try:
            services.delete_invoice(conn, invoice_id)
        except KeyError as exc:
            raise HTTPException(404, "請求書が見つかりません") from exc
    return {"ok": True}
