import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DEJA_FIXED_NOW"] = "2026-10-17T07:00:00Z"
os.environ.setdefault("MODE", "mock")

import pytest  # noqa: E402


@pytest.fixture()
def engine():
    from app.mock_engine import MockEngine
    return MockEngine()


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    from app import deps
    from app.main import app
    from app.mock_engine import MockEngine
    from app import chat
    deps.set_engine(MockEngine())
    chat.SESSIONS.clear()
    return TestClient(app)
