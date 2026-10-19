"""FastAPI dependencies: database sessions, the signed-in user, role guards, rate limits."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SESSION_COOKIE, RateLimiter
from app.models import Role, User
from app.services import Services


def get_services(request: Request) -> Services:
    return request.app.state.services


ServicesDep = Annotated[Services, Depends(get_services)]


async def get_db(services: ServicesDep) -> AsyncIterator[AsyncSession]:
    async with services.db() as session:
        yield session


DbDep = Annotated[AsyncSession, Depends(get_db)]


async def current_user(request: Request, services: ServicesDep, db: DbDep) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = await services.sessions.resolve(db, token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _require(*roles: Role):
    def guard(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot perform this action.")
        return user

    return guard


PatientUser = Annotated[User, Depends(_require(Role.PATIENT))]
ClinicianUser = Annotated[User, Depends(_require(Role.CLINICIAN))]
AdminUser = Annotated[User, Depends(_require(Role.ADMIN))]
CareUser = Annotated[User, Depends(_require(Role.PATIENT, Role.CLINICIAN))]


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
