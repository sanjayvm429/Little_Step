from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .config import settings


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def local_date_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class Database:
    """Thread-safe SQLite manager with WAL mode and foreign key constraints."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or settings.sqlite_db_path
        self._lock = threading.RLock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db_path.parent.chmod(0o700)
        self._conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=15.0,
        )
        self._conn.row_factory = sqlite3.Row
        self.db_path.chmod(0o600)
        with self._lock:
            self._conn.execute("PRAGMA journal_mode = WAL;")
            self._conn.execute("PRAGMA foreign_keys = ON;")
            self._conn.execute("PRAGMA synchronous = NORMAL;")
        self.init_schema()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def query_all(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return cur.fetchall()

    def query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return cur.fetchone()

    def execute(self, sql: str, params: tuple = ()) -> int:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur.lastrowid

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def init_schema(self) -> None:
        with self.transaction() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS employees (
                    employee_id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    department TEXT NOT NULL,
                    designation TEXT NOT NULL,
                    contact_number TEXT,
                    registration_date TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                    consent_given INTEGER NOT NULL DEFAULT 0,
                    consent_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
                CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);

                CREATE TABLE IF NOT EXISTS face_embeddings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
                    face_position TEXT NOT NULL CHECK (face_position IN ('front', 'left', 'right')),
                    embedding BLOB NOT NULL,
                    image_path TEXT NOT NULL,
                    quality_score REAL NOT NULL,
                    face_width INTEGER NOT NULL,
                    face_height INTEGER NOT NULL,
                    sharpness REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(employee_id, face_position)
                );

                CREATE INDEX IF NOT EXISTS idx_face_embeddings_employee ON face_embeddings(employee_id);

                CREATE TABLE IF NOT EXISTS cameras (
                    camera_id TEXT PRIMARY KEY,
                    external_camera_id TEXT UNIQUE,
                    camera_name TEXT NOT NULL,
                    stream_url TEXT NOT NULL,
                    mediamtx_path TEXT,
                    department TEXT,
                    camera_purpose TEXT NOT NULL DEFAULT 'monitoring'
                        CHECK (camera_purpose IN ('check_in', 'check_out', 'monitoring')),
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                    stream_status TEXT NOT NULL DEFAULT 'idle',
                    last_frame_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_cameras_purpose_status ON cameras(camera_purpose, status);

                CREATE TABLE IF NOT EXISTS attendance (
                    attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
                    employee_name TEXT NOT NULL,
                    date TEXT NOT NULL,
                    check_in_time TEXT,
                    check_out_time TEXT,
                    check_in_camera_id TEXT,
                    check_in_camera_name TEXT,
                    check_out_camera_id TEXT,
                    check_out_camera_name TEXT,
                    recognition_confidence REAL,
                    working_duration_seconds INTEGER,
                    attendance_status TEXT NOT NULL CHECK (attendance_status IN ('checked_in', 'checked_out')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
                CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
                CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(attendance_status);

                CREATE TABLE IF NOT EXISTS recognition_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    camera_id TEXT NOT NULL,
                    camera_name TEXT,
                    camera_purpose TEXT NOT NULL,
                    employee_id TEXT,
                    employee_name TEXT,
                    confidence REAL,
                    event_type TEXT NOT NULL CHECK (
                        event_type IN ('check_in', 'check_out', 'duplicate_suppressed', 'unknown', 'no_active_checkin')
                    ),
                    message TEXT,
                    snapshot_path TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_rec_events_created ON recognition_events(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_rec_events_type ON recognition_events(event_type, created_at DESC);

                CREATE TABLE IF NOT EXISTS registration_links (
                    token_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    employee_id TEXT REFERENCES employees(employee_id) ON DELETE CASCADE,
                    pending_employee_json TEXT,
                    expires_at TEXT NOT NULL,
                    used_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (used_status IN ('pending', 'used', 'expired', 'revoked')),
                    used_at TEXT,
                    created_by TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_reg_links_hash ON registration_links(token_hash);
                CREATE INDEX IF NOT EXISTS idx_reg_links_emp ON registration_links(employee_id);

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            now = utc_now_iso()
            defaults = {
                "similarity_threshold": str(settings.default_similarity_threshold),
                "cooldown_seconds": str(settings.default_cooldown_seconds),
                "frame_interval_ms": str(settings.default_frame_interval_ms),
                "mobile_link_ttl_minutes": str(settings.default_mobile_link_ttl_minutes),
            }
            for k, v in defaults.items():
                conn.execute(
                    "INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES (?, ?, ?)",
                    (k, v, now),
                )


def get_runtime_settings(db: Database) -> dict[str, float | int]:
    rows = db.query_all("SELECT key, value FROM settings")
    raw = {r["key"]: r["value"] for r in rows}
    return {
        "similarity_threshold": float(
            raw.get("similarity_threshold", settings.default_similarity_threshold)
        ),
        "cooldown_seconds": int(
            float(raw.get("cooldown_seconds", settings.default_cooldown_seconds))
        ),
        "frame_interval_ms": int(
            float(raw.get("frame_interval_ms", settings.default_frame_interval_ms))
        ),
        "mobile_link_ttl_minutes": int(
            float(raw.get("mobile_link_ttl_minutes", settings.default_mobile_link_ttl_minutes))
        ),
    }
