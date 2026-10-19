from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app import audit
from app.audit import Action
from app.auth import SESSION_COOKIE, hash_password, verify_or_waste_time, verify_password
from app.deps import CurrentUser, DbDep, ServicesDep, client_ip, enforce_rate_limit
from app.models import User
from app.presenters import user_out
from app.schemas import LoginRequest, PasswordChange, UserOut
from app.services import Services

router = APIRouter(prefix="/auth", tags=["auth"])

_BAD_LOGIN = "Incorrect email or password."


def _set_session_cookie(response: Response, svc: Services, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(svc.sessions.ttl.total_seconds()),
        httponly=True,
        secure=svc.settings.cookie_secure,
        samesite="strict",
        path="/api",
    )


@router.post("/login")
async def login(
    body: LoginRequest, request: Request, response: Response, svc: ServicesDep, db: DbDep
) -> UserOut:
    email = body.email.lower()
    enforce_rate_limit(svc.limits.login_ip, client_ip(request))
    enforce_rate_limit(svc.limits.login_account, email)
    user = await db.scalar(select(User).where(User.email == email))
    valid = await run_in_threadpool(verify_or_waste_time, body.password, user)
    if user is None or not valid or not user.is_active:
        if user is not None:
            audit.record(db, Action.LOGIN_FAILED, target=user)
            await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _BAD_LOGIN)

    token = await svc.sessions.create(db, user)
    user.last_login_at = datetime.now(UTC)
    audit.record(db, Action.LOGIN, actor=user)
    await db.commit()
    _set_session_cookie(response, svc, token)
    return user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, svc: ServicesDep, db: DbDep) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        user = await svc.sessions.resolve(db, token)
        await svc.sessions.revoke(db, token)
        if user:
            audit.record(db, Action.LOGOUT, actor=user)
        await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/api")


@router.get("/me")
async def me(user: CurrentUser) -> UserOut:
    return user_out(user)


@router.post("/password")
async def change_password(
    body: PasswordChange, user: CurrentUser, response: Response, svc: ServicesDep, db: DbDep
) -> UserOut:
    if not await run_in_threadpool(verify_password, body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    user.password_hash = await run_in_threadpool(hash_password, body.new_password)
    # Sign out every other device, then issue a fresh session for this one.
    await svc.sessions.revoke_all(db, user.id)
    token = await svc.sessions.create(db, user)
    audit.record(db, Action.PASSWORD_CHANGED, actor=user)
    await db.commit()
    _set_session_cookie(response, svc, token)
    return user_out(user)
