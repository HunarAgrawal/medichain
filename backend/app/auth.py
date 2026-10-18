"""Wallet sign-in (EIP-4361 style): one-time challenges, signature checks and session tokens."""

import secrets
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import jwt
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import to_checksum_address

CHALLENGE_TTL = timedelta(minutes=5)
MAX_PENDING_CHALLENGES = 10_000
JWT_ISSUER = "medichain"
JWT_ALGORITHM = "HS256"


class AuthError(Exception):
    """Sign-in failed or the session token is invalid."""


class WalletNotAllowedError(AuthError):
    """The wallet is valid but not on the allowlist."""


@dataclass(frozen=True)
class Challenge:
    nonce: str
    address: str
    message: str
    expires_at: datetime


@dataclass(frozen=True)
class Session:
    token: str
    address: str
    expires_at: datetime


class WalletAuth:
    def __init__(
        self,
        *,
        secret: str,
        token_ttl: timedelta,
        app_url: str,
        chain_id: int,
        allowed_wallets: list[str],
    ) -> None:
        self._secret = secret
        self._token_ttl = token_ttl
        self._app_url = app_url
        self._domain = urlparse(app_url).netloc
        self._chain_id = chain_id
        self._allowed = frozenset(allowed_wallets)
        self._pending: dict[str, Challenge] = {}
        self._lock = threading.Lock()

    def create_challenge(self, address: str) -> Challenge:
        address = to_checksum_address(address)
        self._ensure_allowed(address)
        now = datetime.now(UTC)
        nonce = secrets.token_hex(16)
        challenge = Challenge(
            nonce=nonce,
            address=address,
            message=self._message(address, nonce, now, now + CHALLENGE_TTL),
            expires_at=now + CHALLENGE_TTL,
        )
        with self._lock:
            self._prune(now)
            if len(self._pending) >= MAX_PENDING_CHALLENGES:
                raise AuthError("Too many pending sign-in requests. Try again shortly.")
            self._pending[nonce] = challenge
        return challenge

    def verify_signature(self, nonce: str, signature: str) -> Session:
        with self._lock:
            challenge = self._pending.pop(nonce, None)
        if challenge is None or challenge.expires_at <= datetime.now(UTC):
            raise AuthError("Sign-in request expired. Please try again.")
        try:
            signer = Account.recover_message(
                encode_defunct(text=challenge.message), signature=signature
            )
        except Exception as exc:  # eth-account raises several unrelated types for bad input
            raise AuthError("Invalid signature.") from exc
        if signer != challenge.address:
            raise AuthError("Signature does not match the requesting wallet.")
        return self.issue_session(signer)

    def issue_session(self, address: str) -> Session:
        now = datetime.now(UTC)
        expires_at = now + self._token_ttl
        claims = {"sub": address, "iss": JWT_ISSUER, "iat": now, "exp": expires_at}
        token = jwt.encode(claims, self._secret, algorithm=JWT_ALGORITHM)
        return Session(token=token, address=address, expires_at=expires_at)

    def authenticate(self, token: str) -> str:
        """Return the wallet address for a valid session token."""
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[JWT_ALGORITHM],
                issuer=JWT_ISSUER,
                options={"require": ["sub", "iss", "iat", "exp"]},
            )
        except jwt.PyJWTError as exc:
            raise AuthError("Your session has expired. Please sign in again.") from exc
        address = to_checksum_address(claims["sub"])
        self._ensure_allowed(address)
        return address

    def _ensure_allowed(self, address: str) -> None:
        if self._allowed and address not in self._allowed:
            raise WalletNotAllowedError("This wallet is not authorized to use Medichain.")

    def _prune(self, now: datetime) -> None:
        expired = [nonce for nonce, c in self._pending.items() if c.expires_at <= now]
        for nonce in expired:
            del self._pending[nonce]

    def _message(self, address: str, nonce: str, issued: datetime, expires: datetime) -> str:
        return (
            f"{self._domain} wants you to sign in with your Ethereum account:\n"
            f"{address}\n\n"
            "Sign in to Medichain. This does not send a transaction or cost gas.\n\n"
            f"URI: {self._app_url}\n"
            "Version: 1\n"
            f"Chain ID: {self._chain_id}\n"
            f"Nonce: {nonce}\n"
            f"Issued At: {_iso(issued)}\n"
            f"Expiration Time: {_iso(expires)}"
        )


def _iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


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
