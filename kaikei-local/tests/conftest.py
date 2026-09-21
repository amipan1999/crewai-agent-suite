import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SAMPLE_CSV = Path(__file__).parent / "fixtures" / "freee_sample.csv"


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    from app import config

    d = tmp_path / "data"
    monkeypatch.setattr(config, "DATA_DIR", d)
    monkeypatch.setattr(config, "EVIDENCE_DIR", d / "evidence")
    monkeypatch.setattr(config, "DB_PATH", d / "kaikei.db")
    monkeypatch.setattr(config, "SETTINGS_PATH", d / "settings.json")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from app.db import init_db

    init_db()
    return d


@pytest.fixture()
def client(data_dir):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
