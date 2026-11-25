from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

_MAGIC = b"LSFACE1"
_NONCE_LENGTH = 12


def _cipher() -> AESGCM:
    try:
        key = bytes.fromhex(settings.face_data_encryption_key)
    except ValueError as exc:
        raise RuntimeError("FACE_DATA_ENCRYPTION_KEY must be 64 hexadecimal characters") from exc
    if len(key) != 32:
        raise RuntimeError("FACE_DATA_ENCRYPTION_KEY must be 64 hexadecimal characters")
    return AESGCM(key)


def validate_data_key() -> None:
    _cipher()


def encrypt_sensitive(value: bytes) -> bytes:
    nonce = os.urandom(_NONCE_LENGTH)
    return _MAGIC + nonce + _cipher().encrypt(nonce, value, _MAGIC)


def decrypt_sensitive(value: bytes) -> bytes:
    if not value.startswith(_MAGIC) or len(value) <= len(_MAGIC) + _NONCE_LENGTH:
        raise ValueError("Encrypted face data has an invalid format")
    nonce_start = len(_MAGIC)
    nonce = value[nonce_start : nonce_start + _NONCE_LENGTH]
    ciphertext = value[nonce_start + _NONCE_LENGTH :]
    return _cipher().decrypt(nonce, ciphertext, _MAGIC)


def encrypt_json(value: dict[str, Any]) -> str:
    encrypted = encrypt_sensitive(json.dumps(value, separators=(",", ":")).encode("utf-8"))
    return "enc:v1:" + base64.urlsafe_b64encode(encrypted).decode("ascii")


def decrypt_json(value: str) -> dict[str, Any]:
    if not value.startswith("enc:v1:"):
        raise ValueError("Registration data is not encrypted")
    encrypted = base64.urlsafe_b64decode(value[7:].encode("ascii"))
    return json.loads(decrypt_sensitive(encrypted))
