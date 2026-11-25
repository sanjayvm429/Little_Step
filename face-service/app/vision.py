from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Iterable

import cv2
import numpy as np

from .config import settings


class FaceValidationError(ValueError):
    """Raised when an uploaded/captured face image fails validation."""


@dataclass
class ExtractedFace:
    embedding: np.ndarray  # float32 (1, 128)
    bbox: tuple[int, int, int, int]
    score: float
    sharpness: float
    sanitized_jpeg: bytes


@dataclass
class FrameFace:
    embedding: np.ndarray
    bbox: tuple[int, int, int, int]
    score: float


@dataclass
class GalleryEntry:
    employee_id: str
    employee_name: str
    face_position: str
    embedding: np.ndarray


@dataclass
class MatchResult:
    matched: bool
    employee_id: str | None
    employee_name: str | None
    confidence: float
    face_position: str | None


def _resize_if_large(img: np.ndarray, max_dim: int = 1600) -> np.ndarray:
    h, w = img.shape[:2]
    largest = max(h, w)
    if largest <= max_dim:
        return img
    scale = max_dim / float(largest)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _laplacian_sharpness(gray_crop: np.ndarray) -> float:
    if gray_crop.size == 0:
        return 0.0
    return float(cv2.Laplacian(gray_crop, cv2.CV_64F).var())


class FaceVisionPipeline:
    """Thread-safe wrapper around OpenCV YuNet detector and SFace recognizer."""

    def __init__(self) -> None:
        if not settings.yunet_model_path.exists():
            raise FileNotFoundError(f"YuNet model not found: {settings.yunet_model_path}")
        if not settings.sface_model_path.exists():
            raise FileNotFoundError(f"SFace model not found: {settings.sface_model_path}")

        self._lock = threading.Lock()
        self._detector = cv2.FaceDetectorYN.create(
            str(settings.yunet_model_path),
            "",
            (320, 320),
            score_threshold=0.55,
            nms_threshold=0.3,
            top_k=5000,
        )
        self._recognizer = cv2.FaceRecognizerSF.create(
            str(settings.sface_model_path),
            "",
        )

    def _detect_raw(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        self._detector.setInputSize((w, h))
        _, faces = self._detector.detect(img)
        if faces is None:
            return np.empty((0, 15), dtype=np.float32)
        return faces

    def validate_and_extract_single_face(
        self, image_bytes: bytes, position_label: str = "face"
    ) -> ExtractedFace:
        if not image_bytes:
            raise FaceValidationError(f"{position_label}: Empty image file")
        if len(image_bytes) > settings.max_upload_bytes:
            raise FaceValidationError(
                f"{position_label}: Image exceeds maximum size of {settings.max_upload_bytes // (1024 * 1024)} MB"
            )

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None or img.size == 0:
            raise FaceValidationError(
                f"{position_label}: Invalid or unsupported image format"
            )

        img = _resize_if_large(img, max_dim=1600)
        img_h, img_w = img.shape[:2]
        if img_w < 120 or img_h < 120:
            raise FaceValidationError(
                f"{position_label}: Image resolution is too small (minimum 120x120)"
            )

        with self._lock:
            faces = self._detect_raw(img)
            valid_faces = [f for f in faces if float(f[14]) >= 0.65]
            if len(valid_faces) == 0:
                raise FaceValidationError(
                    f"{position_label}: No human face detected. Please ensure good lighting and clear face visibility."
                )
            if len(valid_faces) > 1:
                raise FaceValidationError(
                    f"{position_label}: Multiple faces detected ({len(valid_faces)}). Please provide an image with only one person."
                )

            face = valid_faces[0]
            x, y, w, h = [int(round(v)) for v in face[:4]]
            score = float(face[14])

            if w < settings.min_face_size or h < settings.min_face_size:
                raise FaceValidationError(
                    f"{position_label}: Detected face is too small ({w}x{h}px). Please move closer to the camera."
                )

            x1 = max(0, x)
            y1 = max(0, y)
            x2 = min(img_w, x + w)
            y2 = min(img_h, y + h)
            crop = img[y1:y2, x1:x2]
            gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            sharpness = _laplacian_sharpness(gray_crop)
            if sharpness < settings.min_sharpness:
                raise FaceValidationError(
                    f"{position_label}: Image is too blurry (clarity={sharpness:.1f}). Please capture a clearer photo."
                )

            aligned = self._recognizer.alignCrop(img, face)
            feature = self._recognizer.feature(aligned)

        ok, encoded = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            raise FaceValidationError(f"{position_label}: Could not encode image")

        return ExtractedFace(
            embedding=np.array(feature, dtype=np.float32).reshape(1, -1),
            bbox=(x1, y1, max(1, x2 - x1), max(1, y2 - y1)),
            score=score,
            sharpness=sharpness,
            sanitized_jpeg=encoded.tobytes(),
        )

    def extract_faces_from_frame(self, frame: np.ndarray) -> list[FrameFace]:
        if frame is None or frame.size == 0:
            return []
        proc = _resize_if_large(frame, max_dim=1280)
        results: list[FrameFace] = []
        with self._lock:
            faces = self._detect_raw(proc)
            for face in faces:
                score = float(face[14])
                x, y, w, h = [int(round(v)) for v in face[:4]]
                if score < 0.70 or w < 36 or h < 36:
                    continue
                aligned = self._recognizer.alignCrop(proc, face)
                feature = self._recognizer.feature(aligned)
                results.append(
                    FrameFace(
                        embedding=np.array(feature, dtype=np.float32).reshape(1, -1),
                        bbox=(max(0, x), max(0, y), max(1, w), max(1, h)),
                        score=score,
                    )
                )
        return results

    def match_embedding(
        self,
        probe: np.ndarray,
        gallery: Iterable[GalleryEntry],
        threshold: float,
    ) -> MatchResult:
        best_score = -1.0
        best_entry: GalleryEntry | None = None

        probe_vec = np.array(probe, dtype=np.float32).reshape(1, -1)
        for entry in gallery:
            score = float(
                self._recognizer.match(
                    probe_vec,
                    entry.embedding,
                    cv2.FaceRecognizerSF_FR_COSINE,
                )
            )
            if score > best_score:
                best_score = score
                best_entry = entry

        if best_entry is not None and best_score >= threshold:
            return MatchResult(
                matched=True,
                employee_id=best_entry.employee_id,
                employee_name=best_entry.employee_name,
                confidence=round(best_score, 4),
                face_position=best_entry.face_position,
            )

        return MatchResult(
            matched=False,
            employee_id=None,
            employee_name="Unknown",
            confidence=round(max(0.0, best_score), 4),
            face_position=None,
        )


def serialize_embedding(embedding: np.ndarray) -> bytes:
    return np.asarray(embedding, dtype=np.float32).reshape(-1).tobytes()


def deserialize_embedding(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32).reshape(1, -1).copy()
