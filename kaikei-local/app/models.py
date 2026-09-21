"""API の入出力スキーマ (pydantic)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class AccountIn(BaseModel):
    name: str = Field(min_length=1)
    display_name: str = ""
    shortcut1: str = ""
    code: str = ""
    category: Literal["asset", "liability", "equity", "revenue", "expense"]
    default_tax_category: str = "対象外"
    is_active: bool = True
    sort_order: int = 0


class PartnerIn(BaseModel):
    name: str = Field(min_length=1)
    code: str = ""
    kind: Literal["customer", "vendor", "both"] = "both"
    registration_number: str = ""
    address: str = ""
    email: str = ""
    memo: str = ""


class EntryIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    debit_account: Optional[str] = None
    debit_amount: int = 0
    debit_tax_category: Optional[str] = None  # None なら科目の既定値
    debit_partner: str = ""
    debit_item: str = ""
    debit_memo: str = ""
    debit_note: str = ""
    credit_account: Optional[str] = None
    credit_amount: Optional[int] = None  # None なら借方と同額
    credit_tax_category: Optional[str] = None
    credit_partner: str = ""
    credit_item: str = ""
    credit_memo: str = ""
    credit_note: str = ""
    description: str = ""
    payment_date: str = ""
    closing_flag: bool = False
    adjustment_flag: bool = False
    source: str = "manual"
    evidence_ids: list[int] = Field(default_factory=list)

    @field_validator("debit_amount")
    @classmethod
    def _non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("金額は0以上で入力してください")
        return v


class EvidenceUpdate(BaseModel):
    kind: Optional[str] = None
    doc_date: Optional[str] = None
    vendor: Optional[str] = None
    amount: Optional[int] = None
    memo: Optional[str] = None


class InvoiceItem(BaseModel):
    description: str = ""
    quantity: float = 1
    unit: str = ""
    unit_price: int = 0
    tax_rate: int = 10  # 10 / 8 / 0


class InvoiceIn(BaseModel):
    invoice_no: Optional[str] = None  # None なら自動採番
    partner_name: str = Field(min_length=1)
    partner_address: str = ""
    issue_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: str = ""
    subject: str = ""
    items: list[InvoiceItem] = Field(default_factory=list)
    note: str = ""
    status: Literal["draft", "issued", "paid"] = "draft"
    paid_date: str = ""


class InvoiceStatusIn(BaseModel):
    status: Literal["draft", "issued", "paid"]
    paid_date: str = ""
    deposit_account: Optional[str] = None
    fee_amount: int = 0  # 振込手数料を差し引かれた場合


class SettingsIn(BaseModel):
    model_config = {"extra": "allow"}


class OcrApplyIn(BaseModel):
    """OCR 結果から仕訳を作成するときの上書き値."""

    date: Optional[str] = None
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    amount: Optional[int] = None
    tax_category: Optional[str] = None
    partner: Optional[str] = None
    item: Optional[str] = None
    description: Optional[str] = None
