from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("FITPILOT_DB_PATH", ROOT / "database" / "fitpilot.db")).expanduser()
SCHEMA = ROOT / "database" / "schema.sql"


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def initialize() -> None:
    with connect() as db:
        db.executescript(SCHEMA.read_text(encoding="utf-8"))
        db.execute(
            "INSERT OR IGNORE INTO profiles(id, name, goal, experience, weekly_days, minutes_per_session, equipment, dietary_preferences, weekly_budget) "
            "VALUES(1, 'Alex Morgan', 'Build strength and feel more energetic', 'beginner', 4, 35, 'bodyweight, dumbbells', 'high protein', 70)"
        )
        if db.execute("SELECT COUNT(*) FROM exercises").fetchone()[0] == 0:
            seed = ROOT / "database" / "seed.sql"
            db.executescript(seed.read_text(encoding="utf-8"))


def rows(query: str, args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connect() as db:
        return [dict(row) for row in db.execute(query, args).fetchall()]


def one(query: str, args: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(query, args).fetchone()
        return dict(row) if row else None


def execute(query: str, args: tuple[Any, ...] = ()) -> int:
    with connect() as db:
        cur = db.execute(query, args)
        return cur.lastrowid


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
