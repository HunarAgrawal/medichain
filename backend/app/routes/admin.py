"""Administration: accounts, clinician verification, system health and the audit log.

Admins see metadata only. They cannot open studies, scans or reports.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app import workflows
from app.chain import ChainError
from app.deps import AdminUser, DbDep, ServicesDep
from app.models import AuditEvent, Role, Study, User
from app.presenters import audit_event, user_out
from app.schemas import (
    AdminOverview,
    AdminUserCreate,
    AdminUserCreated,
    AdminUserUpdate,
    AuditEventOut,
    Limit,
    Offset,
    ServiceCheck,
    UserOut,
)
from app.services import Services
from app.storage import StorageError

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
async def overview(_: AdminUser, svc: ServicesDep, db: DbDep) -> AdminOverview:
    users = dict((await db.execute(select(User.role, func.count()).group_by(User.role))).all())
    studies = dict(
        (await db.execute(select(Study.status, func.count()).group_by(Study.status))).all()
    )
    return AdminOverview(
        users={role.value: users.get(role, 0) for role in Role},
        studies={"draft": studies.get("draft", 0), "published": studies.get("published", 0)},
        services={"chain": await _chain_check(svc), "ipfs": await _ipfs_check(svc)},
    )


async def _chain_check(svc: Services) -> ServiceCheck:
    try:
        status_ = await svc.registry.status()
    except ChainError as exc:
        return ServiceCheck(ok=False, detail=f"Unreachable: {exc}")
    if status_.owner != status_.operator:
        return ServiceCheck(ok=False, detail="The operator key does not own the registry contract.")
    balance = status_.operator_balance_wei / 10**18
    return ServiceCheck(
        ok=balance > 0.05,
        detail=f"Block {status_.block_number}. Operator balance {balance:.3f} ETH.",
    )


async def _ipfs_check(svc: Services) -> ServiceCheck:
    try:
        return ServiceCheck(ok=True, detail=await svc.storage.ping())
    except StorageError as exc:
        return ServiceCheck(ok=False, detail=str(exc))


@router.get("/users")
async def list_users(
    _: AdminUser,
    db: DbDep,
    role: Role | None = None,
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Limit = 50,
    offset: Offset = 0,
) -> list[UserOut]:
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if term := q.strip():
        like = f"%{term}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like)))
    users = await db.scalars(query.order_by(User.created_at.desc()).limit(limit).offset(offset))
    return [user_out(u) for u in users.all()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: AdminUserCreate, admin: AdminUser, svc: ServicesDep, db: DbDep
) -> AdminUserCreated:
    temporary = None if body.password else secrets.token_urlsafe(12)
    user = await workflows.create_user(
        svc,
        db,
        name=body.name,
        email=body.email,
        role=body.role,
        password=body.password or temporary or "",
        title=body.title,
        date_of_birth=body.date_of_birth,
        actor=admin,
    )
    return AdminUserCreated(user=user_out(user), temporary_password=temporary)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str, body: AdminUserUpdate, admin: AdminUser, svc: ServicesDep, db: DbDep
) -> UserOut:
    user = await db.get(User, user_id)
    if user is None:
        raise workflows.not_found("User")
    await workflows.set_user_active(svc, db, user=user, active=body.is_active, actor=admin)
    return user_out(user)


@router.get("/audit")
async def audit_log(
    _: AdminUser,
    db: DbDep,
    action: str | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> list[AuditEventOut]:
    query = select(AuditEvent)
    if action:
        query = query.where(AuditEvent.action == action)
    events = await db.scalars(
        query.order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(limit).offset(offset)
    )
    return [audit_event(e) for e in events.unique().all()]
