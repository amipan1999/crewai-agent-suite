"""Claude API（画像・PDF 読み取り）による領収書・請求書の構造化抽出."""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .. import config

IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_SIDE = 2000  # 長辺をこのピクセルに収めてトークン消費を抑える


class LineItem(BaseModel):
    name: str = Field(description="品目名")
    amount: int = Field(description="税込金額（円）")
    tax_rate: int = Field(description="税率 10 / 8 / 0")


class ReceiptExtraction(BaseModel):
    doc_type: Literal["receipt", "invoice_received", "invoice_issued", "other"] = Field(
        description="書類の種類: receipt=領収書・レシート, invoice_received=受け取った請求書, invoice_issued=自分が発行した請求書の控え, other=その他"
    )
    date: Optional[str] = Field(description="取引日 YYYY-MM-DD。読めなければ null")
    vendor: Optional[str] = Field(description="店名・発行者名")
    total: Optional[int] = Field(description="税込合計金額（円）。読めなければ null")
    tax: Optional[int] = Field(description="消費税額（円）。不明なら null")
    tax_rate: int = Field(description="主な税率 10 / 8 / 0")
    has_reduced_rate: bool = Field(description="軽減税率(8%)の品目を含むか")
    registration_number: Optional[str] = Field(description="適格請求書発行事業者登録番号 (T+13桁)。無ければ null")
    payment_method: Optional[str] = Field(description="現金 / クレジットカード / 電子マネー / 銀行振込 / 不明")
    suggested_account: str = Field(description="最も適切な勘定科目（与えられた一覧から選ぶ）")
    suggested_tax_category: str = Field(description="税区分（与えられた一覧から選ぶ）")
    description: str = Field(description="摘要（何を購入したか 20文字程度）")
    items: list[LineItem] = Field(description="主な明細（最大10件）")
    confidence: float = Field(description="読み取りの確からしさ 0〜1")
    raw_text: str = Field(description="書類に印字されている文字をできるだけそのまま書き起こしたもの")
    notes: Optional[str] = Field(description="判断に迷った点や利用者への注意（例: 私用の可能性、宛名が無い）")


SYSTEM_PROMPT = """あなたは日本の個人事業主（青色申告）の記帳を手伝う経理担当者です。
渡された領収書・レシート・請求書の画像やPDFを読み取り、仕訳に必要な情報を構造化して返してください。

ルール:
- 金額はすべて日本円の整数。税込合計を total に入れる。
- 日付は西暦 YYYY-MM-DD。令和表記は西暦に直す（令和6年=2024年）。
- 勘定科目は次の一覧から必ず選ぶ:
{accounts}
- 税区分は次から選ぶ: 課対仕入10%, 課対仕入8%（軽）, 非課仕入, 対象外, 課税売上10%, 課税売上8%（軽）, 非課売上, 不課税
  飲食料品・新聞の購入は 課対仕入8%（軽）。事業者が発行した請求書の控え(invoice_issued)なら売上系の税区分。
- 飲食店の支払いは、1人あたり少額でカフェ等なら会議費、それ以外の飲食・贈答は交際費を基本とする。
- 判断が難しいときは confidence を下げ、notes に理由を書く。
- raw_text には読み取れた文字を可能な限り書き起こす（後で検索に使う）。
"""


def _prepare_image(path: Path, mime: str) -> tuple[str, str]:
    """画像を縮小・JPEG化して base64 を返す。HEIC 等は Pillow で開けなければそのまま送る."""
    try:
        from PIL import Image, ImageOps

        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        if max(img.size) > MAX_SIDE:
            img.thumbnail((MAX_SIDE, MAX_SIDE))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88)
        return base64.standard_b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"
    except Exception:  # noqa: BLE001 - 変換失敗時は原本を送る
        data = path.read_bytes()
        return base64.standard_b64encode(data).decode("ascii"), mime if mime in IMAGE_TYPES else "image/jpeg"


def build_content(path: Path, mime: str) -> list[dict[str, Any]]:
    if mime == "application/pdf":
        data = base64.standard_b64encode(path.read_bytes()).decode("ascii")
        block: dict[str, Any] = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    else:
        b64, media = _prepare_image(path, mime)
        block = {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}}
    return [block, {"type": "text", "text": "この書類を読み取り、仕訳情報を抽出してください。"}]


def ocr_with_claude(*, path: str, mime: str, settings: dict[str, Any], accounts: list[dict[str, Any]]) -> dict[str, Any]:
    from . import OcrError

    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover
        raise OcrError("anthropic パッケージがインストールされていません (pip install anthropic)") from exc

    api_key = config.resolve_api_key(settings)
    if not api_key:
        raise OcrError("Claude API キーが設定されていません。設定画面で登録するか、環境変数 ANTHROPIC_API_KEY を設定してください。")

    client = anthropic.Anthropic(api_key=api_key)
    model = settings.get("claude_model") or "claude-opus-5"
    account_lines = "\n".join(
        f"  - {a['name']}（{ {'asset':'資産','liability':'負債','equity':'資本','revenue':'収益','expense':'費用'}.get(a['category'], '') }）"
        for a in accounts
        if a.get("is_active", 1)
    )
    system = SYSTEM_PROMPT.format(accounts=account_lines)
    messages = [{"role": "user", "content": build_content(Path(path), mime)}]
    common = dict(model=model, max_tokens=16000, system=system, messages=messages, output_format=ReceiptExtraction)

    try:
        if settings.get("refusal_fallback", True):
            try:
                # 安全分類器による拒否時は、サーバ側で別モデルへ自動フォールバックさせる
                response = client.beta.messages.parse(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **common
                )
            except anthropic.BadRequestError:
                response = client.messages.parse(**common)
        else:
            response = client.messages.parse(**common)
    except anthropic.AuthenticationError as exc:
        raise OcrError("Claude API キーが無効です。設定を確認してください。") from exc
    except anthropic.PermissionDeniedError as exc:
        raise OcrError("この API キーにはモデルを使う権限がありません。") from exc
    except anthropic.NotFoundError as exc:
        raise OcrError(f"モデル '{model}' が見つかりません。設定のモデル名を確認してください。") from exc
    except anthropic.RateLimitError as exc:
        raise OcrError("API のレート制限に達しました。しばらく待ってから再実行してください。") from exc
    except anthropic.APIStatusError as exc:
        raise OcrError(f"Claude API エラー ({exc.status_code}): {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise OcrError("Claude API に接続できません。ネットワークを確認してください。") from exc

    if response.stop_reason == "refusal":
        detail = getattr(getattr(response, "stop_details", None), "explanation", None) or ""
        raise OcrError(f"モデルがこの書類の読み取りを拒否しました。{detail}".strip())
    if response.stop_reason == "max_tokens":
        raise OcrError("出力が長すぎて途中で打ち切られました。書類を分割して再実行してください。")

    parsed: ReceiptExtraction | None = response.parsed_output
    if parsed is None:
        raise OcrError("Claude から構造化された結果を取得できませんでした。")

    result = parsed.model_dump()
    result["items"] = [i.model_dump() for i in parsed.items][:10]
    result["warnings"] = [parsed.notes] if parsed.notes else []
    result["model"] = getattr(response, "model", model)
    usage = getattr(response, "usage", None)
    if usage is not None:
        result["usage"] = {"input_tokens": getattr(usage, "input_tokens", None), "output_tokens": getattr(usage, "output_tokens", None)}
    return result
