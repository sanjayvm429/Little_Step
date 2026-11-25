from __future__ import annotations

import threading
import time
import logging
from datetime import datetime
from typing import Any

import cv2
import numpy as np

from .config import settings
from .database import Database, get_runtime_settings, local_date_str, utc_now_iso
from .privacy import decrypt_sensitive, encrypt_sensitive
from .vision import (
    FaceVisionPipeline,
    GalleryEntry,
    MatchResult,
    deserialize_embedding,
)

logger = logging.getLogger("face_service.attendance")


class AttendanceProcessor:
    """Handles recognition matching, Check-in / Check-out rules, and cooldown deduplication."""

    def __init__(self, db: Database, vision: FaceVisionPipeline) -> None:
        self.db = db
        self.vision = vision
        self._lock = threading.Lock()
        self._cooldowns: dict[tuple[str, str], float] = {}
        self._unknown_last_logged: dict[str, float] = {}
        settings.unknown_snapshots_dir.mkdir(parents=True, exist_ok=True)

    def load_active_gallery(self) -> list[GalleryEntry]:
        rows = self.db.query_all(
            """
            SELECT fe.employee_id, e.full_name, fe.face_position, fe.embedding
            FROM face_embeddings fe
            JOIN employees e ON e.employee_id = fe.employee_id
            WHERE e.status = 'active'
            """
        )
        return [
            GalleryEntry(
                employee_id=r["employee_id"],
                employee_name=r["full_name"],
                face_position=r["face_position"],
                embedding=deserialize_embedding(decrypt_sensitive(r["embedding"])),
            )
            for r in rows
        ]

    def process_frame(
        self,
        camera_id: str,
        frame: np.ndarray,
        now_ts: float | None = None,
    ) -> list[dict[str, Any]]:
        camera = self.db.query_one(
            "SELECT * FROM cameras WHERE camera_id = ?", (camera_id,)
        )
        if not camera or camera["status"] != "active":
            return []

        purpose = camera["camera_purpose"]
        camera_name = camera["camera_name"]
        runtime = get_runtime_settings(self.db)
        threshold = float(runtime["similarity_threshold"])
        cooldown_seconds = int(runtime["cooldown_seconds"])

        detected = self.vision.extract_faces_from_frame(frame)
        if not detected:
            return []

        gallery = self.load_active_gallery()
        results: list[dict[str, Any]] = []
        current_ts = now_ts if now_ts is not None else time.monotonic()

        for face in detected:
            match = self.vision.match_embedding(face.embedding, gallery, threshold)
            if not match.matched or not match.employee_id:
                event = self._record_unknown(
                    camera_id=camera_id,
                    camera_name=camera_name,
                    purpose=purpose,
                    confidence=match.confidence,
                    frame=frame,
                    bbox=face.bbox,
                    current_ts=current_ts,
                )
                results.append(event)
                continue

            if purpose not in ("check_in", "check_out"):
                results.append(
                    {
                        "matched": True,
                        "employee_id": match.employee_id,
                        "employee_name": match.employee_name,
                        "confidence": match.confidence,
                        "event_type": "monitoring_only",
                        "message": "Camera purpose is monitoring only",
                    }
                )
                continue

            outcome = self._apply_attendance_event(
                camera_id=camera_id,
                camera_name=camera_name,
                purpose=purpose,
                match=match,
                cooldown_seconds=cooldown_seconds,
                current_ts=current_ts,
            )
            results.append(outcome)

        return results

    def _record_unknown(
        self,
        camera_id: str,
        camera_name: str,
        purpose: str,
        confidence: float,
        frame: np.ndarray,
        bbox: tuple[int, int, int, int],
        current_ts: float,
    ) -> dict[str, Any]:
        with self._lock:
            last = self._unknown_last_logged.get(camera_id)
            should_log = last is None or (current_ts - last) >= 10.0
            if should_log:
                self._unknown_last_logged[camera_id] = current_ts

        snapshot_rel: str | None = None
        if should_log:
            snapshot_rel = self._save_unknown_snapshot(camera_id, frame, bbox)
            self.db.execute(
                """
                INSERT INTO recognition_events
                (camera_id, camera_name, camera_purpose, employee_id, employee_name, confidence, event_type, message, snapshot_path, created_at)
                VALUES (?, ?, ?, NULL, 'Unknown', ?, 'unknown', ?, ?, ?)
                """,
                (
                    camera_id,
                    camera_name,
                    purpose,
                    confidence,
                    "Unrecognized person detected",
                    snapshot_rel,
                    utc_now_iso(),
                ),
            )
            self._prune_old_unknown_snapshots()

        return {
            "matched": False,
            "employee_id": None,
            "employee_name": "Unknown",
            "confidence": confidence,
            "event_type": "unknown",
            "logged": should_log,
        }

    def _save_unknown_snapshot(
        self, camera_id: str, frame: np.ndarray, bbox: tuple[int, int, int, int]
    ) -> str | None:
        try:
            x, y, w, h = bbox
            annotated = frame.copy()
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 165, 255), 2)
            safe_camera_id = "".join(
                char if char.isalnum() or char in ("-", "_") else "_" for char in camera_id
            )
            filename = f"unk_{safe_camera_id}_{int(time.time() * 1000)}.jpg.enc"
            dest = settings.unknown_snapshots_dir / filename
            ok, encoded = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
            )
            if not ok:
                raise RuntimeError("Could not encode unknown-face snapshot")
            dest.write_bytes(encrypt_sensitive(encoded.tobytes()))
            dest.chmod(0o600)
            return filename
        except Exception:
            logger.exception("Could not save an unknown-face snapshot")
            return None

    def _prune_old_unknown_snapshots(self, max_files: int = 100) -> None:
        files = sorted(
            settings.unknown_snapshots_dir.glob("unk_*.jpg.enc"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for stale in files[max_files:]:
            try:
                stale.unlink(missing_ok=True)
            except OSError:
                logger.exception("Could not remove expired unknown-face snapshot %s", stale)

    def _apply_attendance_event(
        self,
        camera_id: str,
        camera_name: str,
        purpose: str,
        match: MatchResult,
        cooldown_seconds: int,
        current_ts: float,
    ) -> dict[str, Any]:
        assert match.employee_id is not None
        emp_id = match.employee_id
        emp_name = match.employee_name or emp_id
        now_iso = utc_now_iso()
        today = local_date_str()

        with self._lock:
            cooldown_key = (emp_id, purpose)
            last_ts = self._cooldowns.get(cooldown_key)
            if last_ts is not None and (current_ts - last_ts) < cooldown_seconds:
                return {
                    "matched": True,
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "confidence": match.confidence,
                    "event_type": "duplicate_suppressed",
                    "message": f"Suppressed repeated {purpose} within {cooldown_seconds}s cooldown",
                }

            with self.db.transaction() as conn:
                active_row = conn.execute(
                    """
                    SELECT * FROM attendance
                    WHERE employee_id = ? AND attendance_status = 'checked_in'
                    ORDER BY attendance_id DESC LIMIT 1
                    """,
                    (emp_id,),
                ).fetchone()

                if purpose == "check_in":
                    if active_row is not None:
                        self._cooldowns[cooldown_key] = current_ts
                        conn.execute(
                            """
                            INSERT INTO recognition_events
                            (camera_id, camera_name, camera_purpose, employee_id, employee_name, confidence, event_type, message, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, 'duplicate_suppressed', ?, ?)
                            """,
                            (
                                camera_id,
                                camera_name,
                                purpose,
                                emp_id,
                                emp_name,
                                match.confidence,
                                "Employee already has an active check-in today",
                                now_iso,
                            ),
                        )
                        return {
                            "matched": True,
                            "employee_id": emp_id,
                            "employee_name": emp_name,
                            "confidence": match.confidence,
                            "event_type": "duplicate_suppressed",
                            "message": "Employee already checked in",
                            "attendance_id": active_row["attendance_id"],
                        }

                    cur = conn.execute(
                        """
                        INSERT INTO attendance
                        (employee_id, employee_name, date, check_in_time, check_in_camera_id, check_in_camera_name, recognition_confidence, attendance_status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'checked_in', ?, ?)
                        """,
                        (
                            emp_id,
                            emp_name,
                            today,
                            now_iso,
                            camera_id,
                            camera_name,
                            match.confidence,
                            now_iso,
                            now_iso,
                        ),
                    )
                    attendance_id = cur.lastrowid
                    conn.execute(
                        """
                        INSERT INTO recognition_events
                        (camera_id, camera_name, camera_purpose, employee_id, employee_name, confidence, event_type, message, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'check_in', ?, ?)
                        """,
                        (
                            camera_id,
                            camera_name,
                            purpose,
                            emp_id,
                            emp_name,
                            match.confidence,
                            f"Checked in via {camera_name}",
                            now_iso,
                        ),
                    )
                    self._cooldowns.pop((emp_id, "check_out"), None)
                    self._cooldowns[cooldown_key] = current_ts
                    return {
                        "matched": True,
                        "employee_id": emp_id,
                        "employee_name": emp_name,
                        "confidence": match.confidence,
                        "event_type": "check_in",
                        "attendance_id": attendance_id,
                        "message": f"Check-in recorded via {camera_name}",
                    }

                # purpose == "check_out"
                if active_row is None:
                    self._cooldowns[cooldown_key] = current_ts
                    conn.execute(
                        """
                        INSERT INTO recognition_events
                        (camera_id, camera_name, camera_purpose, employee_id, employee_name, confidence, event_type, message, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'no_active_checkin', ?, ?)
                        """,
                        (
                            camera_id,
                            camera_name,
                            purpose,
                            emp_id,
                            emp_name,
                            match.confidence,
                            "Check-out ignored: no active check-in found",
                            now_iso,
                        ),
                    )
                    return {
                        "matched": True,
                        "employee_id": emp_id,
                        "employee_name": emp_name,
                        "confidence": match.confidence,
                        "event_type": "no_active_checkin",
                        "message": "No active check-in found for check-out",
                    }

                check_in_dt = datetime.fromisoformat(active_row["check_in_time"])
                check_out_dt = datetime.fromisoformat(now_iso)
                duration_sec = max(0, int((check_out_dt - check_in_dt).total_seconds()))
                best_conf = max(
                    float(active_row["recognition_confidence"] or 0.0),
                    float(match.confidence),
                )

                conn.execute(
                    """
                    UPDATE attendance
                    SET check_out_time = ?,
                        check_out_camera_id = ?,
                        check_out_camera_name = ?,
                        working_duration_seconds = ?,
                        recognition_confidence = ?,
                        attendance_status = 'checked_out',
                        updated_at = ?
                    WHERE attendance_id = ?
                    """,
                    (
                        now_iso,
                        camera_id,
                        camera_name,
                        duration_sec,
                        best_conf,
                        now_iso,
                        active_row["attendance_id"],
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO recognition_events
                    (camera_id, camera_name, camera_purpose, employee_id, employee_name, confidence, event_type, message, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'check_out', ?, ?)
                    """,
                    (
                        camera_id,
                        camera_name,
                        purpose,
                        emp_id,
                        emp_name,
                        match.confidence,
                        f"Checked out via {camera_name}",
                        now_iso,
                    ),
                )
                self._cooldowns[cooldown_key] = current_ts
                return {
                    "matched": True,
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "confidence": match.confidence,
                    "event_type": "check_out",
                    "attendance_id": active_row["attendance_id"],
                    "working_duration_seconds": duration_sec,
                    "message": f"Check-out recorded via {camera_name}",
                }
