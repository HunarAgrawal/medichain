"""Sharing (patients), the clinician directory and patient lists (clinicians), and activity."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app import workflows
from app.deps import (
    CareUser,
    ClinicianUser,
    DbDep,
    PatientUser,
    ServicesDep,
    enforce_rate_limit,
)
from app.models import AuditEvent, Role, Study, StudyStatus, User, UTCDateTime
from app.presenters import audit_event, user_summary
from app.schemas import AuditEventOut, CareTeamMember, PatientOverview, ShareRequest, UserSummary

router = APIRouter(tags=["people"])

Search = Annotated[str, Query(max_length=100)]


# Sharing: a patient's care team is the set of clinicians they granted on-chain.


@router.get("/sharing")
async def get_care_team(patient: PatientUser, svc: ServicesDep, db: DbDep) -> list[CareTeamMember]:
    members = await workflows.care_team(svc, db, patient)
    return [CareTeamMember(clinician=user_summary(c), active=c.is_active) for c in members]


@router.post("/sharing", status_code=status.HTTP_201_CREATED)
async def share_records(
    body: ShareRequest, patient: PatientUser, svc: ServicesDep, db: DbDep
) -> list[CareTeamMember]:
    enforce_rate_limit(svc.limits.chain_write, patient.id)
    clinician = await workflows.find_clinician(db, body.clinician_id)
    await workflows.grant_access(svc, db, patient=patient, clinician=clinician)
    return await get_care_team(patient, svc, db)


@router.delete("/sharing/{clinician_id}", status_code=status.HTTP_204_NO_CONTENT)
async def stop_sharing(
    clinician_id: str, patient: PatientUser, svc: ServicesDep, db: DbDep
) -> None:
    enforce_rate_limit(svc.limits.chain_write, patient.id)
    clinician = await db.get(User, clinician_id)
    if clinician is None or clinician.role is not Role.CLINICIAN:
        raise workflows.not_found("Clinician")
    await workflows.revoke_access(svc, db, patient=patient, clinician=clinician)


# Directory


@router.get("/directory/clinicians")
async def search_clinicians(_: CareUser, db: DbDep, q: Search = "") -> list[UserSummary]:
    query = select(User).where(User.role == Role.CLINICIAN, User.is_active.is_(True))
    if term := q.strip():
        like = f"%{term}%"
        query = query.where(or_(User.name.ilike(like), User.title.ilike(like)))
    users = await db.scalars(query.order_by(User.name).limit(20))
    return [user_summary(u) for u in users.all()]


@router.get("/directory/patients")
async def search_patients(_: ClinicianUser, db: DbDep, q: Search = "") -> list[PatientOverview]:
    query = select(User).where(User.role == Role.PATIENT, User.is_active.is_(True))
    if term := q.strip():
        query = query.where(User.name.ilike(f"%{term}%"))
    users = await db.scalars(query.order_by(User.name).limit(20))
    return [
        PatientOverview(
            patient=user_summary(u),
            date_of_birth=u.date_of_birth,
            shared_with_me=False,
            published_studies=0,
            last_study_at=None,
        )
        for u in users.all()
    ]


@router.get("/patients")
async def my_patients(
    clinician: ClinicianUser, svc: ServicesDep, db: DbDep
) -> list[PatientOverview]:
    """Patients who shared their records with me, or whom I have reported on."""
    shared = set(await svc.registry.patients_of(workflows.wallet(clinician)))
    issued = select(Study.patient_id).where(Study.clinician_id == clinician.id)
    patients = (
        await db.scalars(
            select(User).where(
                User.role == Role.PATIENT,
                or_(User.wallet_address.in_(shared), User.id.in_(issued)),
            )
        )
    ).all()
    overviews = []
    for patient in patients:
        is_shared = patient.wallet_address in shared
        visible = select(func.count(), func.max(Study.published_at, type_=UTCDateTime())).where(
            Study.patient_id == patient.id, Study.status == StudyStatus.PUBLISHED
        )
        if not is_shared:
            visible = visible.where(Study.clinician_id == clinician.id)
        count, last = (await db.execute(visible)).one()
        overviews.append(
            PatientOverview(
                patient=user_summary(patient),
                date_of_birth=patient.date_of_birth,
                shared_with_me=is_shared,
                published_studies=count,
                last_study_at=last,
            )
        )
    never = datetime.min.replace(tzinfo=UTC)
    return sorted(overviews, key=lambda o: o.last_study_at or never, reverse=True)


# Activity: what happened to my records, or what I did.


@router.get("/activity")
async def my_activity(
    user: CareUser, db: DbDep, limit: Annotated[int, Query(ge=1, le=100)] = 50
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
