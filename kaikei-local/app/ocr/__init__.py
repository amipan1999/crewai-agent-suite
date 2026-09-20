"""OCR / AI 仕訳提案.

provider:
  claude     Claude API（画像・PDF を直接読み取り、構造化された仕訳候補を返す）
  tesseract  ローカル Tesseract でテキスト化し、キーワード辞書で科目を推定
  none       OCR を行わない（手入力）

どのプロバイダでも最終的に ``OcrResult``（dict）を返し、証跡レコードの ocr_json に保存する。
"""

from __future__ import annotations

from typing import Any

from .rules import classify_text, extract_fields_from_text, RESULT_KEYS  # noqa: F401


class OcrError(Exception):
    """ユーザーに表示するための OCR エラー."""


def run_ocr(*, path: str, mime: str, settings: dict[str, Any], accounts: list[dict[str, Any]], provider: str | None = None) -> dict[str, Any]:
    provider = provider or settings.get("ocr_provider") or "none"
    if provider == "claude":
        from .claude_ocr import ocr_with_claude

        result = ocr_with_claude(path=path, mime=mime, settings=settings, accounts=accounts)
    elif provider == "tesseract":
        from .tesseract_ocr import ocr_with_tesseract

        result = ocr_with_tesseract(path=path, mime=mime, accounts=accounts)
    else:
        raise OcrError("OCR プロバイダが 'none' に設定されています。設定画面で Claude API キーを登録するか Tesseract を選んでください。")
    result["provider"] = provider
    return normalize_result(result, accounts)


def normalize_result(result: dict[str, Any], accounts: list[dict[str, Any]]) -> dict[str, Any]:
    """欠けているキーを補い、科目名がマスタに無ければ近いものへ寄せる."""
    names = {a["name"] for a in accounts}
    out = {k: result.get(k) for k in RESULT_KEYS}
    out["items"] = result.get("items") or []
    out["raw_text"] = result.get("raw_text") or ""
    out["provider"] = result.get("provider", "")
    out["warnings"] = list(result.get("warnings") or [])
    acct = out.get("suggested_account")
    if acct and acct not in names:
        alias = {"接待交際費": "交際費", "外注費": "外注工賃", "支払報酬料": "外注工賃", "事務用品費": "消耗品費" if "事務用品費" not in names else "事務用品費"}
        if acct in alias and alias[acct] in names:
            out["suggested_account"] = alias[acct]
        else:
            fallback = classify_text(" ".join(filter(None, [out.get("vendor"), out.get("description"), out.get("raw_text")])), accounts)
            out["warnings"].append(f"提案された科目「{acct}」はマスタに無いため「{fallback}」に置き換えました")
            out["suggested_account"] = fallback
    if not out.get("suggested_account"):
        out["suggested_account"] = classify_text(" ".join(filter(None, [out.get("vendor"), out.get("description"), out.get("raw_text")])), accounts)
    if out.get("total") is not None:
        try:
            out["total"] = int(round(float(out["total"])))
        except (TypeError, ValueError):
            out["total"] = None
    if out.get("tax") is not None:
        try:
            out["tax"] = int(round(float(out["tax"])))
        except (TypeError, ValueError):
            out["tax"] = None
    if not out.get("suggested_tax_category"):
        rate = out.get("tax_rate")
        if out.get("doc_type") == "invoice_issued":
            out["suggested_tax_category"] = "課税売上8%（軽）" if rate == 8 else "課税売上10%"
        else:
            out["suggested_tax_category"] = "課対仕入8%（軽）" if rate == 8 else "課対仕入10%"
    if out.get("confidence") is None:
        out["confidence"] = 0.5
    return out
