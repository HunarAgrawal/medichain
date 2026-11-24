"""Administration: the operations dashboard, staff accounts, organization settings, sites and the
audit log. Everything is scoped to the admin's organization.

Admins see operational metadata only. They cannot open studies, scans or reports.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import or_, select

from app import analytics, audit, workflows
from app.audit import Action
from app.chain import ChainError
from app.deps import AdminUser, DbDep, ServicesDep
from app.models import AuditEvent, Role, Site, User
from app.presenters import audit_event, org_out, site_out, user_out
from app.schemas import (
    AdminUserCreate,
    AdminUserCreated,
    AdminUserUpdate,
    AuditEventOut,
    Dashboard,
    Limit,
    Offset,
    OrgOut,
    OrgUpdate,
    ServiceCheck,
    SiteCreate,
    SiteOut,
    UserOut,
)
from app.services import Services
from app.storage import StorageError

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
async def dashboard(
    admin: AdminUser,
    svc: ServicesDep,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> Dashboard:
    kpis, daily, tat, sites, reporters = await analytics.compute(db, admin.organization, days)
    staff, patients = await analytics.headcount(db, admin.org_id)
    return Dashboard(
        period_days=days,
        kpis=kpis,
        daily=daily,
        tat_by_priority=tat,
        sites=sites,
        reporters=reporters,
        staff=staff,
        patients=patients,
        services={"chain": await _chain_check(svc), "storage": await _storage_check(svc)},
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


async def _storage_check(svc: Services) -> ServiceCheck:
    try:
        return ServiceCheck(ok=True, detail=await svc.storage.ping())
    except StorageError as exc:
        return ServiceCheck(ok=False, detail=str(exc))


# Staff


@router.get("/users")
async def list_staff(
    admin: AdminUser,
    db: DbDep,
    role: Role | None = None,
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Limit = 100,
    offset: Offset = 0,
) -> list[UserOut]:
    query = select(User).where(User.org_id == admin.org_id, User.role != Role.PATIENT)
    if role:
        query = query.where(User.role == role)
    if term := q.strip():
        like = f"%{term}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like)))
    users = await db.scalars(query.order_by(User.role, User.name).limit(limit).offset(offset))
    return [user_out(u) for u in users.unique().all()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: AdminUserCreate, admin: AdminUser, svc: ServicesDep, db: DbDep
) -> AdminUserCreated:
    temporary = None if body.password else secrets.token_urlsafe(12)
    user = await workflows.create_staff(
        svc,
        db,
        org_id=admin.org_id,
        name=body.name,
        email=body.email,
        role=Role(body.role),
        password=body.password or temporary or "",
        title=body.title or None,
        qualification=body.qualification or None,
        registration_number=body.registration_number or None,
        site_id=body.site_id,
        phone=body.phone,
        actor=admin,
    )
    return AdminUserCreated(user=user_out(user), temporary_password=temporary)


@router.patch("/users/{user_id}")
async def update_staff(
    user_id: str, body: AdminUserUpdate, admin: AdminUser, svc: ServicesDep, db: DbDep
) -> UserOut:
    user = await db.get(User, user_id)
    if user is None or user.org_id != admin.org_id or user.role is Role.PATIENT:
        raise workflows.not_found("User")
    await workflows.set_user_active(svc, db, user=user, active=body.is_active, actor=admin)
    return user_out(user)


# Organization and sites


@router.get("/organization")
async def get_organization(admin: AdminUser) -> OrgOut:
    return org_out(admin.organization)


# Details that may be cleared; the rest (name, kind, department...) can only be replaced.
_OPTIONAL_ORG_FIELDS = {"address", "city", "phone", "email", "accreditation"}


@router.patch("/organization")
async def update_organization(body: OrgUpdate, admin: AdminUser, db: DbDep) -> OrgOut:
    """Branding and details shown in the app and printed on every report."""
    org = admin.organization
    changed = []
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in _OPTIONAL_ORG_FIELDS:
            setattr(org, field, value or None)
        elif value is not None:
            setattr(org, field, value)
        else:
            continue
        changed.append(field)
    if changed:
        audit.record(db, Action.SETTINGS_UPDATED, actor=admin, detail=", ".join(sorted(changed)))
    await db.commit()
    return org_out(org)


@router.get("/sites")
async def list_all_sites(admin: AdminUser, db: DbDep) -> list[SiteOut]:
    sites = await db.scalars(select(Site).where(Site.org_id == admin.org_id).order_by(Site.name))
    return [site_out(s) for s in sites.all()]


@router.post("/sites", status_code=status.HTTP_201_CREATED)
async def create_site(body: SiteCreate, admin: AdminUser, db: DbDep) -> SiteOut:
    site = await workflows.create_site(
        db,
        org_id=admin.org_id,
        name=body.name,
        code=body.code,
        kind=body.kind,
        city=body.city or None,
        actor=admin,
    )
    await db.commit()
    return site_out(site)


# Audit log


@router.get("/audit")
async def audit_log(
    admin: AdminUser,
    db: DbDep,
    action: str | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> list[AuditEventOut]:
    query = select(AuditEvent).where(AuditEvent.org_id == admin.org_id)
    if action:
        query = query.where(AuditEvent.action == action)
    events = await db.scalars(
        query.order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(limit).offset(offset)
    )
    return [audit_event(e) for e in events.unique().all()]
