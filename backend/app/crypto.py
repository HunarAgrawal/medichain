"""Authenticated encryption (AES-256-GCM) for everything sensitive the platform stores.

Each blob is bound to its owner through the associated data ``medichain/v1/{kind}/{subject}``,
so a ciphertext cannot be replayed under another study or user, or swapped between kinds.
"""

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_MAGIC = b"MCE1"
_NONCE_BYTES = 12
_HEADER_BYTES = len(_MAGIC) + _NONCE_BYTES


class IntegrityError(Exception):
    """The blob is malformed, was tampered with, or belongs to a different subject."""


def _context(kind: str, subject: str) -> bytes:
    return f"medichain/v1/{kind}/{subject}".encode()


def seal(key: bytes, plaintext: bytes, *, kind: str, subject: str) -> bytes:
    nonce = os.urandom(_NONCE_BYTES)
    return _MAGIC + nonce + AESGCM(key).encrypt(nonce, plaintext, _context(kind, subject))


def unseal(key: bytes, blob: bytes, *, kind: str, subject: str) -> bytes:
    if len(blob) <= _HEADER_BYTES or not blob.startswith(_MAGIC):
        raise IntegrityError("Unrecognized blob format")
    nonce = blob[len(_MAGIC) : _HEADER_BYTES]
    try:
        return AESGCM(key).decrypt(nonce, blob[_HEADER_BYTES:], _context(kind, subject))
    except InvalidTag as exc:
        raise IntegrityError("Authentication tag mismatch") from exc
