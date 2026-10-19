"""Passwords, sessions and rate limiting."""

import hashlib
import hmac
import secrets
import threading
import time
from datetime import UTC, datetime, timedelta
from functools import cache

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SessionToken, User

SESSION_COOKIE = "medichain_session"
PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128

# scrypt parameters (RFC 7914). N=2^15 costs about 32 MiB and ~50 ms per hash.
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = encoded.split("$")
        if scheme != "scrypt":
            return False
        candidate = _scrypt(password, bytes.fromhex(salt), int(n), int(r), int(p))
    except ValueError:
        return False
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


@cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def verify_or_waste_time(password: str, user: User | None) -> bool:
    """Verify a login. Unknown emails still pay the hashing cost, so timing reveals nothing."""
    if user is None:
        verify_password(password, _dummy_hash())
        return False
    return verify_password(password, user.password_hash)


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=n, r=r, p=p, dklen=32, maxmem=_SCRYPT_MAXMEM
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class SessionManager:
    """Opaque, server-side sessions: revocable at any time (logout, deactivation)."""

    def __init__(self, ttl: timedelta) -> None:
        self.ttl = ttl

    async def create(self, db: AsyncSession, user: User) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        db.add(
            SessionToken(token_hash=_token_hash(token), user_id=user.id, expires_at=now + self.ttl)
        )
        return token

    async def resolve(self, db: AsyncSession, token: str) -> User | None:
        session = await db.get(SessionToken, _token_hash(token))
        if session is None:
            return None
        if session.expires_at <= datetime.now(UTC) or not session.user.is_active:
            await db.delete(session)
            await db.commit()
            return None
        return session.user

    async def revoke(self, db: AsyncSession, token: str) -> None:
        await db.execute(delete(SessionToken).where(SessionToken.token_hash == _token_hash(token)))

    async def revoke_all(self, db: AsyncSession, user_id: str) -> None:
        await db.execute(delete(SessionToken).where(SessionToken.user_id == user_id))

    async def purge_expired(self, db: AsyncSession) -> None:
        await db.execute(delete(SessionToken).where(SessionToken.expires_at <= datetime.now(UTC)))

    async def count(self, db: AsyncSession, user_id: str) -> int:
        rows = await db.scalars(
            select(SessionToken.token_hash).where(SessionToken.user_id == user_id)
        )
        return len(rows.all())


class RateLimiter:
    """Sliding-window limiter kept in process memory (one instance per API worker)."""

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> float | None:
        """Record a hit for ``key``. Return seconds to wait if the limit is exceeded."""
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._hits.get(key, ()) if now - t < self.window]
            if len(hits) >= self.limit:
                self._hits[key] = hits
                return self.window - (now - hits[0])
            hits.append(now)
            self._hits[key] = hits
            if len(self._hits) > 10_000:
                self._hits = {k: v for k, v in self._hits.items() if now - v[-1] < self.window}
        return None
