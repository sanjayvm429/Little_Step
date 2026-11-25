from __future__ import annotations

import hashlib
import logging
import re
import secrets
import shutil
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .attendance_engine import AttendanceProcessor
from .cctv_worker import CameraWorkerManager
from .config import settings
from .database import Database, get_runtime_settings, utc_now_iso
from .privacy import decrypt_json, decrypt_sensitive, encrypt_json, encrypt_sensitive, validate_data_key
from .vision import (
    ExtractedFace,
    FaceValidationError,
    FaceVisionPipeline,
    serialize_embedding,
)

logging.basicConfig(level=logging.INFO)


class ServiceState:
    db: Database
    vision: FaceVisionPipeline
    processor: AttendanceProcessor
    workers: CameraWorkerManager


state = ServiceState()


class UpdateEmployeePayload(BaseModel):
    full_name: str | None = None
    email: str | None = None
    department: str | None = None
    designation: str | None = None
    contact_number: str | None = None
    registration_date: str | None = None
    status: Literal["active", "inactive"] | None = None


class CreateMobileLinkPayload(BaseModel):
    employee_id: str
    full_name: str | None = None
    email: str | None = None
    department: str | None = None
    designation: str | None = None
    contact_number: str | None = None
    registration_date: str | None = None
    consent_given: bool = False
    mode: Literal["new_employee", "reregister"] = "new_employee"
    ttl_minutes: int | None = None
    created_by: str | None = None


class CameraUpsertPayload(BaseModel):
    camera_id: str
    external_camera_id: str | None = None
    camera_name: str
    stream_url: str = ""
    mediamtx_path: str | None = None
    department: str | None = None
    camera_purpose: Literal["check_in", "check_out", "monitoring"] = "monitoring"
    status: Literal["active", "inactive"] = "active"


class CameraUpdatePayload(BaseModel):
    camera_name: str | None = None
    stream_url: str | None = None
    mediamtx_path: str | None = None
    department: str | None = None
    camera_purpose: Literal["check_in", "check_out", "monitoring"] | None = None
    status: Literal["active", "inactive"] | None = None


class UpdateSettingsPayload(BaseModel):
    similarity_threshold: float | None = Field(default=None, ge=0.1, le=0.95)
    cooldown_seconds: int | None = Field(default=None, ge=5, le=3600)
    frame_interval_ms: int | None = Field(default=None, ge=100, le=10000)
    mobile_link_ttl_minutes: int | None = Field(default=None, ge=1, le=1440)


def create_app(db_path: Path | None = None, start_workers: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if len(settings.service_secret) < 32:
            raise RuntimeError("FACE_SERVICE_SECRET must contain at least 32 characters")
        validate_data_key()
        settings.private_images_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        settings.unknown_snapshots_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        settings.private_images_dir.chmod(0o700)
        settings.unknown_snapshots_dir.chmod(0o700)
        state.db = Database(db_path=db_path)
        state.vision = FaceVisionPipeline()
        state.processor = AttendanceProcessor(state.db, state.vision)
        state.workers = CameraWorkerManager(state.db, state.processor)
        if start_workers:
            state.workers.reconcile()
        try:
            yield
        finally:
            if start_workers:
                state.workers.stop_all()
            state.db.close()

    app = FastAPI(title="LittleSteps Face Recognition Service", version="1.0.0", lifespan=lifespan)

    def require_secret(x_face_service_secret: str | None = Header(default=None)) -> None:
        if not x_face_service_secret or not secrets.compare_digest(
            x_face_service_secret, settings.service_secret
        ):
            raise HTTPException(status_code=401, detail="Unauthorized service call")

    def _hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def _employee_dir(employee_id: str) -> Path:
        safe_id = employee_id.strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", safe_id):
            raise HTTPException(status_code=400, detail="Invalid employee_id")
        return settings.private_images_dir / safe_id

    def _save_face_artifacts(
        employee_id: str,
        extracted: dict[str, ExtractedFace],
        conn,
    ) -> None:
        emp_dir = _employee_dir(employee_id)
        emp_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        emp_dir.chmod(0o700)
        now = utc_now_iso()
        written_files: list[Path] = []
        try:
            for pos, item in extracted.items():
                img_file = emp_dir / f"{pos}.jpg.enc"
                img_file.write_bytes(encrypt_sensitive(item.sanitized_jpeg))
                img_file.chmod(0o600)
                written_files.append(img_file)
                rel_path = f"{emp_dir.name}/{pos}.jpg.enc"
                conn.execute(
                    """
                    INSERT INTO face_embeddings
                    (employee_id, face_position, embedding, image_path, quality_score, face_width, face_height, sharpness, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(employee_id, face_position) DO UPDATE SET
                        embedding = excluded.embedding,
                        image_path = excluded.image_path,
                        quality_score = excluded.quality_score,
                        face_width = excluded.face_width,
                        face_height = excluded.face_height,
                        sharpness = excluded.sharpness,
                        created_at = excluded.created_at
                    """,
                    (
                        employee_id,
                        pos,
                        encrypt_sensitive(serialize_embedding(item.embedding)),
                        rel_path,
                        item.score,
                        item.bbox[2],
                        item.bbox[3],
                        item.sharpness,
                        now,
                    ),
                )
        except Exception:
            for image_path in written_files:
                image_path.unlink(missing_ok=True)
            raise

    async def _read_image_upload(upload: UploadFile, label: str) -> bytes:
        if upload.content_type not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(
                status_code=400,
                detail=f"{label}: Only JPEG, PNG, and WebP images are accepted",
            )
        raw = await upload.read(settings.max_upload_bytes + 1)
        if len(raw) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail=f"{label}: Image exceeds the maximum upload size")
        return raw

    def _validate_employee_details(
        employee_id: str,
        full_name: str,
        email: str,
        department: str,
        designation: str,
        registration_date: str,
    ) -> None:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", employee_id.strip()):
            raise HTTPException(status_code=400, detail="Employee ID may contain letters, numbers, hyphens, and underscores")
        if not full_name.strip() or len(full_name.strip()) > 120:
            raise HTTPException(status_code=400, detail="Employee name is required and must be at most 120 characters")
        normalized_email = email.strip()
        if (
            len(normalized_email) > 254
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized_email)
        ):
            raise HTTPException(status_code=400, detail="A valid email address is required")
        if not department.strip() or len(department.strip()) > 100:
            raise HTTPException(status_code=400, detail="Department is required and must be at most 100 characters")
        if not designation.strip() or len(designation.strip()) > 100:
            raise HTTPException(status_code=400, detail="Designation is required and must be at most 100 characters")
        normalized_date = registration_date.strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", normalized_date):
            raise HTTPException(status_code=400, detail="Registration date must use YYYY-MM-DD format")
        try:
            date.fromisoformat(normalized_date)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Registration date must use YYYY-MM-DD format") from exc

    def _validate_three_images(
        front_bytes: bytes, left_bytes: bytes, right_bytes: bytes
    ) -> dict[str, ExtractedFace]:
        try:
            return {
                "front": state.vision.validate_and_extract_single_face(front_bytes, "Front image"),
                "left": state.vision.validate_and_extract_single_face(left_bytes, "Left-side image"),
                "right": state.vision.validate_and_extract_single_face(right_bytes, "Right-side image"),
            }
        except FaceValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _serialize_employee(row) -> dict:
        faces = state.db.query_all(
            "SELECT face_position, quality_score, face_width, face_height, sharpness, created_at FROM face_embeddings WHERE employee_id = ?",
            (row["employee_id"],),
        )
        positions = [f["face_position"] for f in faces]
        return {
            "employee_id": row["employee_id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "department": row["department"],
            "designation": row["designation"],
            "contact_number": row["contact_number"],
            "registration_date": row["registration_date"],
            "status": row["status"],
            "consent_given": bool(row["consent_given"]),
            "consent_at": row["consent_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "face_positions": positions,
            "has_all_faces": len(positions) == 3,
            "face_details": [dict(f) for f in faces],
        }

    # ---------- Health ----------

    @app.get("/health")
    def health():
        return {
            "success": True,
            "status": "ok",
            "active_workers": state.workers.active_camera_ids() if start_workers else [],
        }

    # ---------- Face validation preview ----------

    @app.post("/faces/validate", dependencies=[Depends(require_secret)])
    async def validate_single_face(
        position: Literal["front", "left", "right"] = Form("front"),
        image: UploadFile = File(...),
    ):
        raw = await _read_image_upload(image, f"{position.title()} image")
        try:
            res = state.vision.validate_and_extract_single_face(raw, f"{position.title()} image")
        except FaceValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "success": True,
            "valid": True,
            "position": position,
            "score": round(res.score, 4),
            "sharpness": round(res.sharpness, 2),
            "bbox": res.bbox,
        }

    # ---------- Employees ----------

    @app.get("/employees", dependencies=[Depends(require_secret)])
    def list_employees(
        search: str | None = Query(default=None),
        department: str | None = Query(default=None),
        status: str | None = Query(default=None),
    ):
        sql = "SELECT * FROM employees WHERE 1=1"
        params: list[str] = []
        if department:
            sql += " AND department = ?"
            params.append(department)
        if status in ("active", "inactive"):
            sql += " AND status = ?"
            params.append(status)
        if search:
            sql += " AND (employee_id LIKE ? OR full_name LIKE ? OR email LIKE ?)"
            q = f"%{search}%"
            params.extend([q, q, q])
        sql += " ORDER BY created_at DESC"
        rows = state.db.query_all(sql, tuple(params))
        return {"success": True, "employees": [_serialize_employee(r) for r in rows]}

    @app.get("/employees/{employee_id}", dependencies=[Depends(require_secret)])
    def get_employee(employee_id: str):
        row = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Employee not found")
        return {"success": True, "employee": _serialize_employee(row)}

    @app.post("/employees", status_code=201, dependencies=[Depends(require_secret)])
    async def register_employee(
        employee_id: str = Form(...),
        full_name: str = Form(...),
        email: str = Form(...),
        department: str = Form(...),
        designation: str = Form(...),
        contact_number: str | None = Form(default=None),
        registration_date: str = Form(...),
        consent_given: bool = Form(...),
        front_image: UploadFile = File(...),
        left_image: UploadFile = File(...),
        right_image: UploadFile = File(...),
    ):
        emp_id = employee_id.strip()
        clean_email = email.strip().lower()
        _validate_employee_details(
            emp_id,
            full_name,
            clean_email,
            department,
            designation,
            registration_date,
        )
        if contact_number and len(contact_number.strip()) > 32:
            raise HTTPException(status_code=400, detail="Contact number must be at most 32 characters")
        if not consent_given:
            raise HTTPException(status_code=400, detail="Employee consent is required before collecting face data")

        existing = state.db.query_one(
            "SELECT employee_id FROM employees WHERE employee_id = ? OR LOWER(email) = LOWER(?)",
            (emp_id, clean_email),
        )
        if existing:
            raise HTTPException(status_code=409, detail="An employee with this Employee ID or Email already exists")

        front_bytes = await _read_image_upload(front_image, "Front image")
        left_bytes = await _read_image_upload(left_image, "Left-side image")
        right_bytes = await _read_image_upload(right_image, "Right-side image")
        extracted = _validate_three_images(front_bytes, left_bytes, right_bytes)

        now = utc_now_iso()
        with state.db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO employees
                (employee_id, full_name, email, department, designation, contact_number, registration_date, status, consent_given, consent_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)
                """,
                (
                    emp_id,
                    full_name.strip(),
                    clean_email,
                    department.strip(),
                    designation.strip(),
                    contact_number.strip() if contact_number else None,
                    registration_date.strip(),
                    now,
                    now,
                    now,
                ),
            )
            _save_face_artifacts(emp_id, extracted, conn)
        row = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (emp_id,))
        return {"success": True, "employee": _serialize_employee(row)}

    @app.put("/employees/{employee_id}", dependencies=[Depends(require_secret)])
    def update_employee(employee_id: str, payload: UpdateEmployeePayload):
        row = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Employee not found")

        full_name = payload.full_name.strip() if payload.full_name is not None else row["full_name"]
        new_email = payload.email.strip().lower() if payload.email is not None else row["email"]
        department = payload.department.strip() if payload.department is not None else row["department"]
        designation = payload.designation.strip() if payload.designation is not None else row["designation"]
        contact_number = payload.contact_number.strip() if payload.contact_number is not None else row["contact_number"]
        registration_date = payload.registration_date.strip() if payload.registration_date is not None else row["registration_date"]
        _validate_employee_details(
            employee_id,
            full_name,
            new_email,
            department,
            designation,
            registration_date,
        )
        if contact_number and len(contact_number) > 32:
            raise HTTPException(status_code=400, detail="Contact number must be at most 32 characters")
        if new_email != row["email"]:
            dup = state.db.query_one(
                "SELECT employee_id FROM employees WHERE LOWER(email) = LOWER(?) AND employee_id != ?",
                (new_email, employee_id),
            )
            if dup:
                raise HTTPException(status_code=409, detail="Another employee already uses this email")

        now = utc_now_iso()
        state.db.execute(
            """
            UPDATE employees
            SET full_name = ?, email = ?, department = ?, designation = ?, contact_number = ?, registration_date = ?, status = ?, updated_at = ?
            WHERE employee_id = ?
            """,
            (
                full_name,
                new_email,
                department,
                designation,
                contact_number,
                registration_date,
                payload.status or row["status"],
                now,
                employee_id,
            ),
        )
        updated = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        return {"success": True, "employee": _serialize_employee(updated)}

    @app.put("/employees/{employee_id}/faces", dependencies=[Depends(require_secret)])
    async def update_employee_faces(
        employee_id: str,
        front_image: UploadFile = File(...),
        left_image: UploadFile = File(...),
        right_image: UploadFile = File(...),
    ):
        row = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Employee not found")

        extracted = _validate_three_images(
            await _read_image_upload(front_image, "Front image"),
            await _read_image_upload(left_image, "Left-side image"),
            await _read_image_upload(right_image, "Right-side image"),
        )
        with state.db.transaction() as conn:
            _save_face_artifacts(employee_id, extracted, conn)
        state.db.execute("UPDATE employees SET updated_at = ? WHERE employee_id = ?", (utc_now_iso(), employee_id))
        updated = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        return {"success": True, "employee": _serialize_employee(updated)}

    @app.delete("/employees/{employee_id}/face-data", dependencies=[Depends(require_secret)])
    def delete_employee_face_data(employee_id: str):
        row = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (employee_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Employee not found")
        state.db.execute("DELETE FROM face_embeddings WHERE employee_id = ?", (employee_id,))
        emp_dir = _employee_dir(employee_id)
        if emp_dir.exists():
            shutil.rmtree(emp_dir)
        return {"success": True, "message": "Face embeddings and images deleted"}

    @app.get("/employees/{employee_id}/faces/{position}", dependencies=[Depends(require_secret)])
    def get_employee_face_image(employee_id: str, position: Literal["front", "left", "right"]):
        rec = state.db.query_one(
            "SELECT image_path FROM face_embeddings WHERE employee_id = ? AND face_position = ?",
            (employee_id, position),
        )
        if not rec:
            raise HTTPException(status_code=404, detail="Face image not found")
        base_dir = settings.private_images_dir.resolve()
        target = (base_dir / rec["image_path"]).resolve()
        if not target.is_relative_to(base_dir) or not target.exists():
            raise HTTPException(status_code=404, detail="Face image file missing")
        return Response(
            content=decrypt_sensitive(target.read_bytes()),
            media_type="image/jpeg",
            headers={"Cache-Control": "private, no-store"},
        )

    # ---------- Mobile Registration Links ----------

    @app.post("/registration-links", status_code=201, dependencies=[Depends(require_secret)])
    def create_registration_link(payload: CreateMobileLinkPayload):
        emp_id = payload.employee_id.strip()
        if not emp_id:
            raise HTTPException(status_code=400, detail="employee_id is required")

        existing = state.db.query_one("SELECT * FROM employees WHERE employee_id = ?", (emp_id,))
        pending_json: str | None = None

        if payload.mode == "new_employee":
            if existing:
                raise HTTPException(status_code=409, detail="An employee with this Employee ID already exists")
            if not payload.full_name or not payload.email or not payload.department or not payload.designation or not payload.registration_date:
                raise HTTPException(status_code=400, detail="Complete employee details are required for new registration")
            _validate_employee_details(
                emp_id,
                payload.full_name,
                payload.email,
                payload.department,
                payload.designation,
                payload.registration_date,
            )
            if payload.contact_number and len(payload.contact_number.strip()) > 32:
                raise HTTPException(status_code=400, detail="Contact number must be at most 32 characters")
            if not payload.consent_given:
                raise HTTPException(status_code=400, detail="Employee consent is required")
            dup_email = state.db.query_one(
                "SELECT employee_id FROM employees WHERE LOWER(email) = LOWER(?)",
                (payload.email.strip(),),
            )
            if dup_email:
                raise HTTPException(status_code=409, detail="An employee with this Email already exists")
            pending_json = encrypt_json(
                {
                    "employee_id": emp_id,
                    "full_name": payload.full_name.strip(),
                    "email": payload.email.strip().lower(),
                    "department": payload.department.strip(),
                    "designation": payload.designation.strip(),
                    "contact_number": payload.contact_number.strip() if payload.contact_number else None,
                    "registration_date": payload.registration_date.strip(),
                    "consent_given": True,
                }
            )
        else:
            if not existing:
                raise HTTPException(status_code=404, detail="Employee not found")

        runtime = get_runtime_settings(state.db)
        ttl = payload.ttl_minutes or int(runtime["mobile_link_ttl_minutes"])
        ttl = max(1, min(ttl, 24 * 60))

        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_token)
        token_id = secrets.token_hex(8)
        now_dt = datetime.now(timezone.utc)
        expires_dt = now_dt + timedelta(minutes=ttl)

        state.db.execute(
            """
            INSERT INTO registration_links
            (token_id, token_hash, employee_id, pending_employee_json, expires_at, used_status, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
            """,
            (
                token_id,
                token_hash,
                emp_id if existing else None,
                pending_json,
                expires_dt.isoformat(),
                payload.created_by,
                now_dt.isoformat(),
            ),
        )
        return {
            "success": True,
            "token_id": token_id,
            "token": raw_token,
            "employee_id": emp_id,
            "expires_at": expires_dt.isoformat(),
            "ttl_minutes": ttl,
        }

    def _resolve_valid_link(raw_token: str):
        token_hash = _hash_token(raw_token)
        link = state.db.query_one(
            "SELECT * FROM registration_links WHERE token_hash = ?", (token_hash,)
        )
        if not link:
            raise HTTPException(status_code=404, detail="Registration link not found or invalid")
        if link["used_status"] == "used":
            raise HTTPException(status_code=410, detail="This registration link has already been used")
        if link["used_status"] == "revoked":
            raise HTTPException(status_code=410, detail="This registration link has been revoked")

        expires_dt = datetime.fromisoformat(link["expires_at"])
        if datetime.now(timezone.utc) >= expires_dt or link["used_status"] == "expired":
            if link["used_status"] == "pending":
                state.db.execute(
                    "UPDATE registration_links SET used_status = 'expired' WHERE token_id = ?",
                    (link["token_id"],),
                )
            raise HTTPException(status_code=410, detail="This registration link has expired")
        return link

    @app.get("/mobile-register/{raw_token}", dependencies=[Depends(require_secret)])
    def get_mobile_registration_info(raw_token: str):
        link = _resolve_valid_link(raw_token)
        if link["pending_employee_json"]:
            data = decrypt_json(link["pending_employee_json"])
            summary = {
                "employee_id": data["employee_id"],
                "full_name": data["full_name"],
                "department": data["department"],
                "mode": "new_employee",
            }
        else:
            emp = state.db.query_one(
                "SELECT employee_id, full_name, department FROM employees WHERE employee_id = ?",
                (link["employee_id"],),
            )
            if not emp:
                raise HTTPException(status_code=404, detail="Target employee no longer exists")
            summary = {
                "employee_id": emp["employee_id"],
                "full_name": emp["full_name"],
                "department": emp["department"],
                "mode": "reregister",
            }
        return {
            "success": True,
            "registration": {
                **summary,
                "expires_at": link["expires_at"],
            },
        }

    @app.get("/registration-links/{token_id}/status", dependencies=[Depends(require_secret)])
    def get_registration_link_status(token_id: str):
        link = state.db.query_one(
            "SELECT token_id, employee_id, expires_at, used_status, used_at FROM registration_links WHERE token_id = ?",
            (token_id,),
        )
        if not link:
            raise HTTPException(status_code=404, detail="Registration link not found")
        status = link["used_status"]
        if status == "pending" and datetime.now(timezone.utc) >= datetime.fromisoformat(link["expires_at"]):
            status = "expired"
            state.db.execute(
                "UPDATE registration_links SET used_status = 'expired' WHERE token_id = ?",
                (token_id,),
            )
        return {
            "success": True,
            "token_id": link["token_id"],
            "employee_id": link["employee_id"],
            "used_status": status,
            "used_at": link["used_at"],
            "expires_at": link["expires_at"],
        }

    @app.post("/mobile-register/{raw_token}/submit", dependencies=[Depends(require_secret)])
    async def submit_mobile_registration(
        raw_token: str,
        consent_confirmed: bool = Form(...),
        front_image: UploadFile = File(...),
        left_image: UploadFile = File(...),
        right_image: UploadFile = File(...),
    ):
        if not consent_confirmed:
            raise HTTPException(status_code=400, detail="Employee consent is required")
        link = _resolve_valid_link(raw_token)
        extracted = _validate_three_images(
            await _read_image_upload(front_image, "Front image"),
            await _read_image_upload(left_image, "Left-side image"),
            await _read_image_upload(right_image, "Right-side image"),
        )

        now = utc_now_iso()
        data = decrypt_json(link["pending_employee_json"]) if link["pending_employee_json"] else None
        emp_id = data["employee_id"] if data else link["employee_id"]
        with state.db.transaction() as conn:
            current_link = conn.execute(
                "SELECT used_status, expires_at FROM registration_links WHERE token_id = ?",
                (link["token_id"],),
            ).fetchone()
            if (
                not current_link
                or current_link["used_status"] != "pending"
                or datetime.now(timezone.utc) >= datetime.fromisoformat(current_link["expires_at"])
            ):
                raise HTTPException(status_code=410, detail="This registration link is no longer valid")

            if data:
                duplicate = conn.execute(
                    "SELECT employee_id FROM employees WHERE employee_id = ? OR LOWER(email) = LOWER(?)",
                    (emp_id, data["email"]),
                ).fetchone()
                if duplicate:
                    raise HTTPException(status_code=409, detail="Employee ID or email has already been registered")
                conn.execute(
                    """
                    INSERT INTO employees
                    (employee_id, full_name, email, department, designation, contact_number, registration_date, status, consent_given, consent_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)
                    """,
                    (
                        emp_id,
                        data["full_name"],
                        data["email"],
                        data["department"],
                        data["designation"],
                        data.get("contact_number"),
                        data["registration_date"],
                        now,
                        now,
                        now,
                    ),
                )
            elif not conn.execute(
                "SELECT employee_id FROM employees WHERE employee_id = ?", (emp_id,)
            ).fetchone():
                raise HTTPException(status_code=404, detail="Target employee no longer exists")

            _save_face_artifacts(emp_id, extracted, conn)
            conn.execute(
                "UPDATE employees SET consent_given = 1, consent_at = ?, updated_at = ? WHERE employee_id = ?",
                (now, now, emp_id),
            )
            changed = conn.execute(
                """
                UPDATE registration_links
                SET used_status = 'used', used_at = ?, employee_id = ?
                WHERE token_id = ? AND used_status = 'pending'
                """,
                (now, emp_id, link["token_id"]),
            ).rowcount
            if changed != 1:
                raise HTTPException(status_code=410, detail="This registration link has already been used")
        return {
            "success": True,
            "message": "Face registration completed successfully",
            "employee_id": emp_id,
        }

    # ---------- Cameras ----------

    @app.get("/cameras", dependencies=[Depends(require_secret)])
    def list_cameras():
        rows = state.db.query_all("SELECT * FROM cameras ORDER BY camera_name ASC")
        return {"success": True, "cameras": [dict(r) for r in rows]}

    @app.post("/cameras/sync", dependencies=[Depends(require_secret)])
    def sync_cameras(items: list[CameraUpsertPayload]):
        now = utc_now_iso()
        with state.db.transaction() as conn:
            for item in items:
                existing = conn.execute(
                    "SELECT * FROM cameras WHERE camera_id = ? OR (external_camera_id IS NOT NULL AND external_camera_id = ?)",
                    (item.camera_id, item.external_camera_id),
                ).fetchone()
                if existing:
                    conn.execute(
                        """
                        UPDATE cameras
                        SET camera_name = ?, stream_url = ?, mediamtx_path = ?, department = ?,
                            status = CASE WHEN ? = 'inactive' THEN 'inactive' ELSE status END,
                            updated_at = ?
                        WHERE camera_id = ?
                        """,
                        (
                            item.camera_name,
                            item.stream_url or existing["stream_url"],
                            item.mediamtx_path or existing["mediamtx_path"],
                            item.department or existing["department"],
                            item.status,
                            now,
                            existing["camera_id"],
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO cameras
                        (camera_id, external_camera_id, camera_name, stream_url, mediamtx_path, department, camera_purpose, status, stream_status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)
                        """,
                        (
                            item.camera_id,
                            item.external_camera_id,
                            item.camera_name,
                            item.stream_url,
                            item.mediamtx_path,
                            item.department,
                            item.camera_purpose,
                            item.status,
                            now,
                            now,
                        ),
                    )
            incoming_ids = {
                item.external_camera_id for item in items if item.external_camera_id
            }
            existing_ids = conn.execute(
                "SELECT camera_id, external_camera_id FROM cameras WHERE external_camera_id IS NOT NULL"
            ).fetchall()
            for existing in existing_ids:
                if existing["external_camera_id"] not in incoming_ids:
                    conn.execute(
                        "DELETE FROM cameras WHERE camera_id = ?",
                        (existing["camera_id"],),
                    )
        if start_workers:
            state.workers.reconcile()
        rows = state.db.query_all("SELECT * FROM cameras ORDER BY camera_name ASC")
        return {"success": True, "cameras": [dict(r) for r in rows]}

    @app.post("/cameras", status_code=201, dependencies=[Depends(require_secret)])
    def upsert_camera(payload: CameraUpsertPayload):
        now = utc_now_iso()
        state.db.execute(
            """
            INSERT INTO cameras
            (camera_id, external_camera_id, camera_name, stream_url, mediamtx_path, department, camera_purpose, status, stream_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)
            ON CONFLICT(camera_id) DO UPDATE SET
                camera_name = excluded.camera_name,
                stream_url = excluded.stream_url,
                mediamtx_path = excluded.mediamtx_path,
                department = excluded.department,
                camera_purpose = excluded.camera_purpose,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                payload.camera_id,
                payload.external_camera_id,
                payload.camera_name,
                payload.stream_url,
                payload.mediamtx_path,
                payload.department,
                payload.camera_purpose,
                payload.status,
                now,
                now,
            ),
        )
        if start_workers:
            state.workers.reconcile()
        row = state.db.query_one("SELECT * FROM cameras WHERE camera_id = ?", (payload.camera_id,))
        return {"success": True, "camera": dict(row)}

    @app.put("/cameras/{camera_id}", dependencies=[Depends(require_secret)])
    def update_camera(camera_id: str, payload: CameraUpdatePayload):
        row = state.db.query_one("SELECT * FROM cameras WHERE camera_id = ?", (camera_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Camera not found")
        now = utc_now_iso()
        state.db.execute(
            """
            UPDATE cameras
            SET camera_name = ?, stream_url = ?, mediamtx_path = ?, department = ?, camera_purpose = ?, status = ?, updated_at = ?
            WHERE camera_id = ?
            """,
            (
                payload.camera_name if payload.camera_name is not None else row["camera_name"],
                payload.stream_url if payload.stream_url is not None else row["stream_url"],
                payload.mediamtx_path if payload.mediamtx_path is not None else row["mediamtx_path"],
                payload.department if payload.department is not None else row["department"],
                payload.camera_purpose if payload.camera_purpose is not None else row["camera_purpose"],
                payload.status if payload.status is not None else row["status"],
                now,
                camera_id,
            ),
        )
        if start_workers:
            state.workers.reconcile()
        updated = state.db.query_one("SELECT * FROM cameras WHERE camera_id = ?", (camera_id,))
        return {"success": True, "camera": dict(updated)}

    @app.delete("/cameras/{camera_id}", dependencies=[Depends(require_secret)])
    def delete_camera(camera_id: str):
        state.db.execute("DELETE FROM cameras WHERE camera_id = ?", (camera_id,))
        if start_workers:
            state.workers.reconcile()
        return {"success": True, "message": "Camera removed"}

    # ---------- Attendance & Recognition Events ----------

    @app.get("/attendance", dependencies=[Depends(require_secret)])
    def list_attendance(
        employee_id: str | None = Query(default=None),
        department: str | None = Query(default=None),
        date_from: str | None = Query(default=None),
        date_to: str | None = Query(default=None),
        status: str | None = Query(default=None),
        limit: int = Query(default=200, ge=1, le=1000),
    ):
        sql = """
            SELECT a.*, e.department, e.designation
            FROM attendance a
            LEFT JOIN employees e ON e.employee_id = a.employee_id
            WHERE 1=1
        """
        params: list[object] = []
        if employee_id:
            sql += " AND a.employee_id = ?"
            params.append(employee_id)
        if department:
            sql += " AND e.department = ?"
            params.append(department)
        if date_from:
            sql += " AND a.date >= ?"
            params.append(date_from)
        if date_to:
            sql += " AND a.date <= ?"
            params.append(date_to)
        if status in ("checked_in", "checked_out"):
            sql += " AND a.attendance_status = ?"
            params.append(status)
        sql += " ORDER BY a.date DESC, a.check_in_time DESC LIMIT ?"
        params.append(limit)
        rows = state.db.query_all(sql, tuple(params))
        return {"success": True, "attendance": [dict(r) for r in rows]}

    @app.get("/recognition/status", dependencies=[Depends(require_secret)])
    def recognition_status():
        cameras = [dict(r) for r in state.db.query_all("SELECT * FROM cameras ORDER BY camera_name ASC")]
        recent = [
            dict(r)
            for r in state.db.query_all(
                "SELECT * FROM recognition_events ORDER BY id DESC LIMIT 30"
            )
        ]
        unknowns = [
            dict(r)
            for r in state.db.query_all(
                "SELECT * FROM recognition_events WHERE event_type = 'unknown' ORDER BY id DESC LIMIT 20"
            )
        ]
        return {
            "success": True,
            "cameras": cameras,
            "active_workers": state.workers.active_camera_ids() if start_workers else [],
            "recent_events": recent,
            "unknown_detections": unknowns,
            "settings": get_runtime_settings(state.db),
        }

    @app.get("/recognition/unknowns/{event_id}/snapshot", dependencies=[Depends(require_secret)])
    def get_unknown_snapshot(event_id: int):
        row = state.db.query_one(
            "SELECT snapshot_path FROM recognition_events WHERE id = ? AND event_type = 'unknown'",
            (event_id,),
        )
        if not row or not row["snapshot_path"]:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        base_dir = settings.unknown_snapshots_dir.resolve()
        target = (base_dir / row["snapshot_path"]).resolve()
        if not target.is_relative_to(base_dir) or not target.exists():
            raise HTTPException(status_code=404, detail="Snapshot file missing")
        return Response(
            content=decrypt_sensitive(target.read_bytes()),
            media_type="image/jpeg",
            headers={"Cache-Control": "private, no-store"},
        )

    @app.put("/recognition/settings", dependencies=[Depends(require_secret)])
    def update_recognition_settings(payload: UpdateSettingsPayload):
        now = utc_now_iso()
        updates = {
            k: str(v)
            for k, v in payload.model_dump(exclude_none=True).items()
        }
        with state.db.transaction() as conn:
            for k, v in updates.items():
                conn.execute(
                    """
                    INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (k, v, now),
                )
        return {"success": True, "settings": get_runtime_settings(state.db)}

    # ---------- Frame processing endpoint (for live test / webcam test) ----------

    @app.post("/recognition/process-frame", dependencies=[Depends(require_secret)])
    async def process_test_frame(
        camera_id: str = Form(...),
        frame_image: UploadFile = File(...),
    ):
        raw = await _read_image_upload(frame_image, "Frame image")
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid frame image")
        events = state.processor.process_frame(camera_id, frame)
        return {"success": True, "events": events}

    return app


app = create_app()
