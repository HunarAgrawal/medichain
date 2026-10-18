"""Authenticated encryption (AES-256-GCM) for files stored on IPFS.

Each blob is bound to its record slot through the associated data, so a ciphertext
cannot be replayed as a different patient's scan or swapped between scan and report.
"""

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_MAGIC = b"MCE1"
_NONCE_BYTES = 12
_HEADER_BYTES = len(_MAGIC) + _NONCE_BYTES


class IntegrityError(Exception):
    """The blob is malformed, was tampered with, or belongs to a different record."""


def _context(kind: str, patient_id: str) -> bytes:
    return f"medichain/v1/{kind}/{patient_id}".encode()


def seal(key: bytes, plaintext: bytes, *, kind: str, patient_id: str) -> bytes:
    nonce = os.urandom(_NONCE_BYTES)
    return _MAGIC + nonce + AESGCM(key).encrypt(nonce, plaintext, _context(kind, patient_id))


def unseal(key: bytes, blob: bytes, *, kind: str, patient_id: str) -> bytes:
    if len(blob) <= _HEADER_BYTES or not blob.startswith(_MAGIC):
        raise IntegrityError("Unrecognized blob format")
    nonce = blob[len(_MAGIC) : _HEADER_BYTES]
    try:
        return AESGCM(key).decrypt(nonce, blob[_HEADER_BYTES:], _context(kind, patient_id))
    except InvalidTag as exc:
        raise IntegrityError("Authentication tag mismatch") from exc
