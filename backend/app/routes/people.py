"""Sharing (patients), the directory of doctors and sites, and activity feeds."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import or_, select

from app import workflows
from app.deps import CurrentUser, DbDep, PatientUser, ServicesDep, StudyViewer, enforce_rate_limit
from app.models import CLINICIAN_ROLES, AuditEvent, Role, Site, Study, User
from app.presenters import audit_event, site_out, user_summary
from app.schemas import AuditEventOut, CareTeamMember, ShareRequest, SiteOut, UserSummary

router = APIRouter(tags=["people"])

Search = Annotated[str, Query(max_length=100)]


# Sharing: a patient's care team is the set of doctors they granted on-chain.


@router.get("/sharing")
async def get_care_team(patient: PatientUser, svc: ServicesDep, db: DbDep) -> list[CareTeamMember]:
    members = await workflows.care_team(svc, db, patient)
    return [CareTeamMember(clinician=user_summary(c), active=c.is_active) for c in members]


@router.post("/sharing", status_code=status.HTTP_201_CREATED)
async def share_records(
    body: ShareRequest, patient: PatientUser, svc: ServicesDep, db: DbDep
) -> list[CareTeamMember]:
    enforce_rate_limit(svc.limits.chain_write, patient.id)
    clinician = await workflows.find_clinician(db, patient.org_id, body.clinician_id)
    await workflows.grant_access(svc, db, patient=patient, clinician=clinician)
    return await get_care_team(patient, svc, db)


@router.delete("/sharing/{clinician_id}", status_code=status.HTTP_204_NO_CONTENT)
async def stop_sharing(
    clinician_id: str, patient: PatientUser, svc: ServicesDep, db: DbDep
) -> None:
    enforce_rate_limit(svc.limits.chain_write, patient.id)
    clinician = await db.get(User, clinician_id)
    if clinician is None or clinician.role not in CLINICIAN_ROLES:
        raise workflows.not_found("Doctor")
    await workflows.revoke_access(svc, db, patient=patient, clinician=clinician)


# Directory


@router.get("/directory/clinicians")
async def search_clinicians(
    user: StudyViewer, db: DbDep, q: Search = "", role: Role | None = None
) -> list[UserSummary]:
    """Doctors and radiologists in the user's organization (for sharing and referrals)."""
    roles = [role] if role in CLINICIAN_ROLES else list(CLINICIAN_ROLES)
    query = select(User).where(
        User.org_id == user.org_id, User.role.in_(roles), User.is_active.is_(True)
    )
    if term := q.strip():
        like = f"%{term}%"
        query = query.where(or_(User.name.ilike(like), User.title.ilike(like)))
    users = await db.scalars(query.order_by(User.name).limit(50))
    return [user_summary(u) for u in users.unique().all()]


@router.get("/sites")
async def list_sites(user: CurrentUser, db: DbDep) -> list[SiteOut]:
    sites = await db.scalars(
        select(Site).where(Site.org_id == user.org_id, Site.is_active.is_(True)).order_by(Site.name)
    )
    return [site_out(s) for s in sites.all()]


# Activity: what happened to my records, or what I did.


@router.get("/activity")
async def my_activity(
    user: StudyViewer, db: DbDep, limit: Annotated[int, Query(ge=1, le=100)] = 50
) -> list[AuditEventOut]:
    if user.role is Role.PATIENT:
        my_studies = select(Study.id).where(Study.patient_id == user.id)
        condition = or_(
            AuditEvent.study_id.in_(my_studies),
            AuditEvent.target_user_id == user.id,
            AuditEvent.actor_id == user.id,
        )
    else:
        condition = or_(AuditEvent.actor_id == user.id, AuditEvent.target_user_id == user.id)
    events = await db.scalars(
        select(AuditEvent)
        .where(condition)
        .order_by(AuditEvent.at.desc(), AuditEvent.id.desc())
        .limit(limit)
    )
    return [audit_event(e) for e in events.unique().all()]
