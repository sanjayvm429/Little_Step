from __future__ import annotations

import shutil
import time
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("FACE_SERVICE_SECRET", "test-face-service-secret-1234567890")
os.environ.setdefault("FACE_DATA_ENCRYPTION_KEY", "a" * 64)

from app.cctv_worker import CameraStreamWorker
from app.config import settings
from app.main import create_app, state

FIXTURES = Path(__file__).parent / "fixtures"
SECRET_HEADER = {"X-Face-Service-Secret": settings.service_secret}


def _make_blank_jpeg() -> bytes:
    img = np.zeros((240, 240, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def _make_two_person_jpeg() -> bytes:
    a = cv2.imread(str(FIXTURES / "person_a.jpg"))
    b = cv2.imread(str(FIXTURES / "person_b.jpg"))
    assert a is not None and b is not None
    b_resized = cv2.resize(b, (a.shape[1], a.shape[0]))
    combined = np.hstack([a, b_resized])
    ok, buf = cv2.imencode(".jpg", combined)
    assert ok
    return buf.tobytes()


def _make_augmented_side_jpeg(src_path: Path, flip: bool = False, scale: float = 0.92) -> bytes:
    img = cv2.imread(str(src_path))
    assert img is not None
    if flip:
        img = cv2.flip(img, 1)
    h, w = img.shape[:2]
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(img, (nw, nh))
    ok, buf = cv2.imencode(".jpg", resized)
    assert ok
    return buf.tobytes()


@pytest.fixture()
def client(tmp_path: Path):
    orig_images = settings.private_images_dir
    orig_snapshots = settings.unknown_snapshots_dir
    settings.private_images_dir = tmp_path / "face_images"
    settings.unknown_snapshots_dir = tmp_path / "unknown_snapshots"
    app = create_app(db_path=tmp_path / "test.db", start_workers=False)
    try:
        with TestClient(app) as tc:
            yield tc
    finally:
        settings.private_images_dir = orig_images
        settings.unknown_snapshots_dir = orig_snapshots
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_secret_required(client: TestClient):
    r = client.get("/employees")
    assert r.status_code == 401
    r_ok = client.get("/employees", headers=SECRET_HEADER)
    assert r_ok.status_code == 200


def test_face_validation_rejects_blank_and_multiple_faces(client: TestClient):
    r_blank = client.post(
        "/faces/validate",
        headers=SECRET_HEADER,
        data={"position": "front"},
        files={"image": ("blank.jpg", _make_blank_jpeg(), "image/jpeg")},
    )
    assert r_blank.status_code == 400
    assert "No human face detected" in r_blank.json()["detail"]

    r_multi = client.post(
        "/faces/validate",
        headers=SECRET_HEADER,
        data={"position": "front"},
        files={"image": ("multi.jpg", _make_two_person_jpeg(), "image/jpeg")},
    )
    assert r_multi.status_code == 400
    assert "Multiple faces detected" in r_multi.json()["detail"]


def test_register_employee_update_and_re_register(client: TestClient):
    front = (FIXTURES / "person_a.jpg").read_bytes()
    left = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=True, scale=0.95)
    right = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=False, scale=0.90)

    r = client.post(
        "/employees",
        headers=SECRET_HEADER,
        data={
            "employee_id": "EMP-101",
            "full_name": "Alice Staff",
            "email": "alice@littlesteps.com",
            "department": "Administration",
            "designation": "Coordinator",
            "contact_number": "9876543210",
            "registration_date": "2026-11-24",
            "consent_given": "true",
        },
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r.status_code == 201, r.text
    emp = r.json()["employee"]
    assert emp["employee_id"] == "EMP-101"
    assert set(emp["face_positions"]) == {"front", "left", "right"}
    assert emp["has_all_faces"] is True
    embedding = state.db.query_one(
        "SELECT embedding, image_path FROM face_embeddings WHERE employee_id = 'EMP-101' LIMIT 1"
    )
    assert embedding["embedding"].startswith(b"LSFACE1")
    stored_image = settings.private_images_dir / embedding["image_path"]
    assert stored_image.read_bytes().startswith(b"LSFACE1")

    # Duplicate employee ID or email rejected
    r_dup = client.post(
        "/employees",
        headers=SECRET_HEADER,
        data={
            "employee_id": "EMP-101",
            "full_name": "Alice Clone",
            "email": "alice2@littlesteps.com",
            "department": "Administration",
            "designation": "Coordinator",
            "registration_date": "2026-11-24",
            "consent_given": "true",
        },
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_dup.status_code == 409

    # Fetch protected image
    r_img = client.get("/employees/EMP-101/faces/front", headers=SECRET_HEADER)
    assert r_img.status_code == 200
    assert r_img.headers["content-type"].startswith("image/jpeg")

    # Update details & deactivate
    r_upd = client.put(
        "/employees/EMP-101",
        headers=SECRET_HEADER,
        json={"designation": "Lead Coordinator", "status": "inactive"},
    )
    assert r_upd.status_code == 200
    assert r_upd.json()["employee"]["designation"] == "Lead Coordinator"
    assert r_upd.json()["employee"]["status"] == "inactive"

    # Re-register faces
    r_ref = client.put(
        "/employees/EMP-101/faces",
        headers=SECRET_HEADER,
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_ref.status_code == 200

    # Delete face data
    r_del = client.delete("/employees/EMP-101/face-data", headers=SECRET_HEADER)
    assert r_del.status_code == 200
    r_after = client.get("/employees/EMP-101", headers=SECRET_HEADER)
    assert r_after.json()["employee"]["has_all_faces"] is False


def test_mobile_link_single_use_and_expiry(client: TestClient):
    front = (FIXTURES / "person_a.jpg").read_bytes()
    left = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=True)
    right = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=False)

    # Create link for new employee
    r_link = client.post(
        "/registration-links",
        headers=SECRET_HEADER,
        json={
            "employee_id": "EMP-202",
            "full_name": "Bob Mobile",
            "email": "bob@littlesteps.com",
            "department": "Teachers",
            "designation": "Teacher",
            "registration_date": "2026-11-24",
            "consent_given": True,
            "mode": "new_employee",
            "ttl_minutes": 15,
        },
    )
    assert r_link.status_code == 201
    token = r_link.json()["token"]
    token_id = r_link.json()["token_id"]

    # Validate token info (must not leak sensitive credentials)
    r_info = client.get(f"/mobile-register/{token}", headers=SECRET_HEADER)
    assert r_info.status_code == 200
    assert r_info.json()["registration"]["employee_id"] == "EMP-202"

    r_no_consent = client.post(
        f"/mobile-register/{token}/submit",
        headers=SECRET_HEADER,
        data={"consent_confirmed": "false"},
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_no_consent.status_code == 400

    # Submit 3 faces via mobile token
    r_sub = client.post(
        f"/mobile-register/{token}/submit",
        headers=SECRET_HEADER,
        data={"consent_confirmed": "true"},
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_sub.status_code == 200
    assert r_sub.json()["employee_id"] == "EMP-202"

    # Reusing same token must fail (single-use)
    r_reuse = client.post(
        f"/mobile-register/{token}/submit",
        headers=SECRET_HEADER,
        data={"consent_confirmed": "true"},
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_reuse.status_code == 410

    r_status = client.get(f"/registration-links/{token_id}/status", headers=SECRET_HEADER)
    assert r_status.json()["used_status"] == "used"

    # Expired token test
    r_exp_link = client.post(
        "/registration-links",
        headers=SECRET_HEADER,
        json={
            "employee_id": "EMP-203",
            "full_name": "Expired User",
            "email": "exp@littlesteps.com",
            "department": "Ops",
            "designation": "Staff",
            "registration_date": "2026-11-24",
            "consent_given": True,
            "mode": "new_employee",
            "ttl_minutes": 10,
        },
    )
    exp_token = r_exp_link.json()["token"]
    exp_id = r_exp_link.json()["token_id"]
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    state.db.execute("UPDATE registration_links SET expires_at = ? WHERE token_id = ?", (past, exp_id))

    r_exp = client.get(f"/mobile-register/{exp_token}", headers=SECRET_HEADER)
    assert r_exp.status_code == 410


def test_checkin_checkout_duplicate_prevention_and_unknown_multi_face(client: TestClient):
    front = (FIXTURES / "person_a.jpg").read_bytes()
    left = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=True)
    right = _make_augmented_side_jpeg(FIXTURES / "person_a.jpg", flip=False)

    # Register person A
    r_emp = client.post(
        "/employees",
        headers=SECRET_HEADER,
        data={
            "employee_id": "EMP-301",
            "full_name": "Alice Recognized",
            "email": "alice301@littlesteps.com",
            "department": "Reception",
            "designation": "Admin",
            "registration_date": "2026-11-24",
            "consent_given": "true",
        },
        files={
            "front_image": ("front.jpg", front, "image/jpeg"),
            "left_image": ("left.jpg", left, "image/jpeg"),
            "right_image": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert r_emp.status_code == 201

    # Configure Reception Check-in and Exit Check-out cameras
    client.post(
        "/cameras",
        headers=SECRET_HEADER,
        json={
            "camera_id": "cam-in",
            "camera_name": "Reception Camera",
            "stream_url": "rtsp://127.0.0.1:8554/reception",
            "camera_purpose": "check_in",
            "status": "active",
        },
    )
    client.post(
        "/cameras",
        headers=SECRET_HEADER,
        json={
            "camera_id": "cam-out",
            "camera_name": "Exit Camera",
            "stream_url": "rtsp://127.0.0.1:8554/exit",
            "camera_purpose": "check_out",
            "status": "active",
        },
    )

    # 1. Check-out before Check-in is ignored
    r_early_out = client.post(
        "/recognition/process-frame",
        headers=SECRET_HEADER,
        data={"camera_id": "cam-out"},
        files={"frame_image": ("f.jpg", front, "image/jpeg")},
    )
    assert r_early_out.status_code == 200
    assert r_early_out.json()["events"][0]["event_type"] == "no_active_checkin"

    # 2. Combined frame with Person A (registered) + Person B (unknown) at Check-in camera
    two_faces = _make_two_person_jpeg()
    r_in = client.post(
        "/recognition/process-frame",
        headers=SECRET_HEADER,
        data={"camera_id": "cam-in"},
        files={"frame_image": ("f.jpg", two_faces, "image/jpeg")},
    )
    assert r_in.status_code == 200
    events = r_in.json()["events"]
    types = {e["event_type"] for e in events}
    assert "check_in" in types
    assert "unknown" in types

    # 3. Repeated sighting at Check-in camera is suppressed
    r_dup_in = client.post(
        "/recognition/process-frame",
        headers=SECRET_HEADER,
        data={"camera_id": "cam-in"},
        files={"frame_image": ("f.jpg", front, "image/jpeg")},
    )
    assert r_dup_in.json()["events"][0]["event_type"] == "duplicate_suppressed"

    # 4. Check-out camera checks employee out
    r_out = client.post(
        "/recognition/process-frame",
        headers=SECRET_HEADER,
        data={"camera_id": "cam-out"},
        files={"frame_image": ("f.jpg", left, "image/jpeg")},
    )
    assert r_out.json()["events"][0]["event_type"] == "check_out"

    # 5. Repeated check-out prevented
    r_dup_out = client.post(
        "/recognition/process-frame",
        headers=SECRET_HEADER,
        data={"camera_id": "cam-out"},
        files={"frame_image": ("f.jpg", left, "image/jpeg")},
    )
    assert r_dup_out.json()["events"][0]["event_type"] == "duplicate_suppressed"

    # Verify attendance record in SQLite
    r_att = client.get("/attendance", headers=SECRET_HEADER)
    records = r_att.json()["attendance"]
    assert len(records) == 1
    assert records[0]["employee_id"] == "EMP-301"
    assert records[0]["check_in_camera_id"] == "cam-in"
    assert records[0]["check_out_camera_id"] == "cam-out"
    assert records[0]["attendance_status"] == "checked_out"
    assert records[0]["working_duration_seconds"] >= 0

    # Verify unknown face was NOT auto-registered
    r_emps = client.get("/employees", headers=SECRET_HEADER)
    assert len(r_emps.json()["employees"]) == 1

    r_status = client.get("/recognition/status", headers=SECRET_HEADER)
    assert len(r_status.json()["unknown_detections"]) >= 1


def test_camera_disconnect_and_reconnect_worker(client: TestClient):
    client.post(
        "/cameras",
        headers=SECRET_HEADER,
        json={
            "camera_id": "cam-reconn",
            "camera_name": "Gate Cam",
            "stream_url": "rtsp://127.0.0.1:8554/gate",
            "camera_purpose": "check_in",
            "status": "active",
        },
    )

    attempts = {"count": 0}

    class FakeCapture:
        def __init__(self, succeed_after: int):
            self.calls = 0
            self.succeed_after = succeed_after

        def isOpened(self) -> bool:
            return attempts["count"] >= self.succeed_after

        def set(self, *_args) -> bool:
            return True

        def read(self):
            self.calls += 1
            if self.calls == 1:
                frame = np.zeros((160, 160, 3), dtype=np.uint8)
                return True, frame
            return False, None

        def release(self) -> None:
            return None

    def factory(_url: str):
        attempts["count"] += 1
        return FakeCapture(succeed_after=2)

    worker = CameraStreamWorker(
        "cam-reconn",
        "rtsp://127.0.0.1:8554/gate",
        state.db,
        state.processor,
        capture_factory=factory,
    )
    worker.start()
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and attempts["count"] < 2:
        time.sleep(0.1)
    time.sleep(0.2)
    worker.stop()

    assert attempts["count"] >= 2
    cam = state.db.query_one("SELECT stream_status FROM cameras WHERE camera_id = 'cam-reconn'")
    assert cam is not None
