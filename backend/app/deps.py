"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import RateLimiter
from app.services import Services


def get_services(request: Request) -> Services:
    return request.app.state.services


ServicesDep = Annotated[Services, Depends(get_services)]

_bearer = HTTPBearer(auto_error=False)


def current_wallet(
    services: ServicesDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Sign in with your wallet first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return services.auth.authenticate(credentials.credentials)


CurrentWallet = Annotated[str, Depends(current_wallet)]


def enforce_rate_limit(limiter: RateLimiter, key: str) -> None:
    retry_after = limiter.check(key)
    if retry_after is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
