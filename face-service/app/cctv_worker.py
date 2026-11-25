from __future__ import annotations

import logging
import os
import threading
import time
from typing import Callable

import cv2

from .attendance_engine import AttendanceProcessor
from .database import Database, get_runtime_settings, utc_now_iso

logger = logging.getLogger("face_service.cctv")

# Use TCP transport for reliable RTSP over MediaMTX
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")


class CameraStreamWorker:
    """Single-connection RTSP reader + throttled face recognition worker for one camera."""

    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        db: Database,
        processor: AttendanceProcessor,
        capture_factory: Callable[[str], cv2.VideoCapture] | None = None,
    ) -> None:
        self.camera_id = camera_id
        self.stream_url = stream_url
        self.db = db
        self.processor = processor
        self._capture_factory = capture_factory or (
            lambda url: cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        )
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"cam-worker-{self.camera_id}",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        self._thread = None

    def _update_status(self, stream_status: str, error: str | None = None, frame_at: str | None = None) -> None:
        if frame_at:
            self.db.execute(
                """
                UPDATE cameras
                SET stream_status = ?, last_error = ?, last_frame_at = ?, updated_at = ?
                WHERE camera_id = ?
                """,
                (stream_status, error, frame_at, utc_now_iso(), self.camera_id),
            )
        else:
            self.db.execute(
                """
                UPDATE cameras
                SET stream_status = ?, last_error = ?, updated_at = ?
                WHERE camera_id = ?
                """,
                (stream_status, error, utc_now_iso(), self.camera_id),
            )

    def _run(self) -> None:
        backoff = 2.0
        while not self._stop_event.is_set():
            cap = None
            try:
                self._update_status("connecting", None)
                cap = self._capture_factory(self.stream_url)
                if cap is None or not cap.isOpened():
                    raise ConnectionError(f"Could not open stream {self.stream_url}")

                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                logger.info("Connected to camera %s", self.camera_id)
                self._update_status("connected", None)
                backoff = 2.0
                last_processed = 0.0

                while not self._stop_event.is_set():
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        raise ConnectionError("Stream frame read failed or disconnected")

                    now = time.monotonic()
                    interval_sec = max(
                        0.1,
                        float(get_runtime_settings(self.db)["frame_interval_ms"]) / 1000.0,
                    )
                    if (now - last_processed) >= interval_sec:
                        last_processed = now
                        self._update_status("connected", None, utc_now_iso())
                        self.processor.process_frame(self.camera_id, frame, now_ts=now)
                    else:
                        time.sleep(0.02)

            except Exception as exc:
                if self._stop_event.is_set():
                    break
                err_msg = str(exc)
                logger.warning(
                    "Camera %s disconnected (%s); reconnecting in %.1fs",
                    self.camera_id,
                    err_msg,
                    backoff,
                )
                self._update_status("reconnecting", err_msg)
                self._stop_event.wait(backoff)
                backoff = min(15.0, backoff * 2.0)
            finally:
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass

        self._update_status("idle", None)


class CameraWorkerManager:
    """Reconciles one background reader per active check-in / check-out camera."""

    def __init__(self, db: Database, processor: AttendanceProcessor) -> None:
        self.db = db
        self.processor = processor
        self._lock = threading.Lock()
        self._workers: dict[str, CameraStreamWorker] = {}

    def reconcile(self) -> None:
        rows = self.db.query_all(
            """
            SELECT camera_id, stream_url
            FROM cameras
            WHERE status = 'active' AND camera_purpose IN ('check_in', 'check_out') AND stream_url != ''
            """
        )
        desired = {r["camera_id"]: r["stream_url"] for r in rows}

        with self._lock:
            for cam_id in list(self._workers.keys()):
                worker = self._workers[cam_id]
                if cam_id not in desired or worker.stream_url != desired[cam_id]:
                    worker.stop()
                    del self._workers[cam_id]

            for cam_id, url in desired.items():
                if cam_id not in self._workers:
                    worker = CameraStreamWorker(cam_id, url, self.db, self.processor)
                    self._workers[cam_id] = worker
                    worker.start()

    def stop_all(self) -> None:
        with self._lock:
            for worker in self._workers.values():
                worker.stop()
            self._workers.clear()

    def active_camera_ids(self) -> list[str]:
        with self._lock:
            return list(self._workers.keys())
