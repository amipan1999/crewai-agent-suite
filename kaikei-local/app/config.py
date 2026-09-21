"""データ保存先と設定ファイルの管理.

すべてのデータは ``KAIKEI_DATA_DIR``（既定: プロジェクト直下の ``data/``）に保存する。
  data/kaikei.db        SQLite データベース
  data/evidence/        証跡ファイル本体（年/月ごとのフォルダ）
  data/settings.json    ユーザー設定（APIキーを含むため git 管理外）
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("KAIKEI_DATA_DIR", BASE_DIR / "data")).resolve()
EVIDENCE_DIR = DATA_DIR / "evidence"
DB_PATH = DATA_DIR / "kaikei.db"
SETTINGS_PATH = DATA_DIR / "settings.json"
STATIC_DIR = BASE_DIR / "static"

DEFAULT_SETTINGS: dict[str, Any] = {
    # 事業者情報
    "business_name": "",
    "owner_name": "",
    "owner_email": "",  # freee CSV の「作成者」列に出力
    "address": "",
    "invoice_registration_number": "",  # 適格請求書発行事業者番号 (T + 13桁)
    "bank_info": "",  # 請求書に印字する振込先
    # 会計設定
    "fiscal_year": 2026,
    "tax_method": "税込経理",
    "default_credit_account": "事業主借",  # 経費入力時の既定の貸方
    "default_debit_account_for_sales": "売掛金",
    "default_deposit_account": "普通預金",
    # OCR / AI
    "ocr_provider": "claude",  # claude | tesseract | none
    "anthropic_api_key": "",
    "claude_model": "claude-opus-5",
    "refusal_fallback": True,
    "auto_ocr_on_upload": True,
    # 請求書
    "invoice_prefix": "INV-",
    "invoice_note": "お振込手数料は貴社にてご負担をお願いいたします。",
}

# UI に返すときにマスクするキー
SECRET_KEYS = {"anthropic_api_key"}


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


def load_settings() -> dict[str, Any]:
    ensure_dirs()
    data: dict[str, Any] = {}
    if SETTINGS_PATH.exists():
        try:
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    merged = dict(DEFAULT_SETTINGS)
    merged.update({k: v for k, v in data.items() if k in DEFAULT_SETTINGS})
    return merged


def save_settings(updates: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    for key, value in updates.items():
        if key not in DEFAULT_SETTINGS:
            continue
        # マスク値（"••••"）が戻ってきた場合は変更しない
        if key in SECRET_KEYS and isinstance(value, str) and value.startswith(("••••", "****")):
            continue
        current[key] = value
    SETTINGS_PATH.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(SETTINGS_PATH, 0o600)
    except OSError:
        pass
    return current


def public_settings(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    """APIキーをマスクした設定を返す."""
    s = dict(settings or load_settings())
    for key in SECRET_KEYS:
        if s.get(key):
            s[key] = "••••••••" + s[key][-4:]
    s["anthropic_api_key_configured"] = bool((settings or load_settings()).get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY"))
    return s


def resolve_api_key(settings: dict[str, Any] | None = None) -> str | None:
    s = settings or load_settings()
    return s.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY") or None
