"""仕訳帳 API."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import get_conn
from ..models import EntryIn
from .. import services

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.get("")
def list_entries(
    year: Optional[int] = None,
    month: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    account: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
):
    with get_conn() as conn:
        return services.list_entries(conn, year=year, month=month, date_from=date_from, date_to=date_to,
                                     account=account, q=q, limit=limit, offset=offset)


@router.post("", status_code=201)
def create_entry(data: EntryIn):
    with get_conn() as conn:
        try:
            return services.create_entry(conn, data)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@router.get("/{entry_id}")
def get_entry(entry_id: int):
    with get_conn() as conn:
        try:
            return services.get_entry(conn, entry_id)
        except KeyError as exc:
            raise HTTPException(404, "仕訳が見つかりません") from exc


@router.put("/{entry_id}")
def update_entry(entry_id: int, data: EntryIn):
    with get_conn() as conn:
        try:
            return services.update_entry(conn, entry_id, data)
        except KeyError as exc:
            raise HTTPException(404, "仕訳が見つかりません") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc


@router.delete("/{entry_id}")
def delete_entry(entry_id: int):
    with get_conn() as conn:
        services.delete_entry(conn, entry_id)
    return {"ok": True}
