"""Single source of 'now'. Set DEJA_FIXED_NOW=2026-10-17T07:00:00Z for deterministic rehearsals/tests."""
import os
from datetime import datetime, timezone


def parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now() -> datetime:
    fixed = os.getenv("DEJA_FIXED_NOW")
    return parse_dt(fixed) if fixed else datetime.now(timezone.utc)
