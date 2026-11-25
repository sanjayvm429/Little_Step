from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


def _resolve_path(env_key: str, default_rel: str) -> Path:
    raw = os.environ.get(env_key, default_rel)
    p = Path(raw)
    return p if p.is_absolute() else (BASE_DIR / p)


class Settings:
    host: str = os.environ.get("FACE_SERVICE_HOST", "127.0.0.1")
    port: int = int(os.environ.get("FACE_SERVICE_PORT", "8001"))
    service_secret: str = os.environ.get("FACE_SERVICE_SECRET", "")
    face_data_encryption_key: str = os.environ.get("FACE_DATA_ENCRYPTION_KEY", "")
    sqlite_db_path: Path = _resolve_path("SQLITE_DB_PATH", "data/face_attendance.db")
    private_images_dir: Path = _resolve_path("PRIVATE_IMAGES_DIR", "data/face_images")
    unknown_snapshots_dir: Path = _resolve_path(
        "UNKNOWN_SNAPSHOTS_DIR", "data/unknown_snapshots"
    )
    yunet_model_path: Path = _resolve_path(
        "YUNET_MODEL_PATH", "models/face_detection_yunet_2023mar.onnx"
    )
    sface_model_path: Path = _resolve_path(
        "SFACE_MODEL_PATH", "models/face_recognition_sface_2021dec.onnx"
    )
    default_similarity_threshold: float = float(
        os.environ.get("DEFAULT_SIMILARITY_THRESHOLD", "0.363")
    )
    default_cooldown_seconds: int = int(
        os.environ.get("DEFAULT_COOLDOWN_SECONDS", "60")
    )
    default_frame_interval_ms: int = int(
        os.environ.get("DEFAULT_FRAME_INTERVAL_MS", "500")
    )
    default_mobile_link_ttl_minutes: int = int(
        os.environ.get("DEFAULT_MOBILE_LINK_TTL_MINUTES", "30")
    )
    min_face_size: int = int(os.environ.get("MIN_FACE_SIZE", "45"))
    min_sharpness: float = float(os.environ.get("MIN_SHARPNESS", "25.0"))
    max_upload_bytes: int = int(os.environ.get("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))


settings = Settings()
