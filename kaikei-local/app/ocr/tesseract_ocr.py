"""ローカル Tesseract による OCR（任意機能）.

利用には Tesseract 本体 (日本語データ jpn) と ``pip install pytesseract`` が必要。
PDF は先頭ページを画像化できないため、画像ファイルのみ対応。
"""

from __future__ import annotations

from typing import Any

from . import rules


def ocr_with_tesseract(*, path: str, mime: str, accounts: list[dict[str, Any]]) -> dict[str, Any]:
    from . import OcrError

    try:
        import pytesseract  # type: ignore
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - 環境依存
        raise OcrError("pytesseract / Pillow がインストールされていません (pip install pytesseract)") from exc
    if mime == "application/pdf":
        raise OcrError("Tesseract プロバイダは PDF に対応していません。画像で保存するか Claude プロバイダを使ってください。")
    try:
        img = Image.open(path)
        text = pytesseract.image_to_string(img, lang="jpn+eng")
    except pytesseract.TesseractNotFoundError as exc:  # type: ignore[attr-defined]
        raise OcrError("Tesseract 本体が見つかりません。インストールして PATH を通してください。") from exc
    return rules.extract_fields_from_text(text, accounts)
