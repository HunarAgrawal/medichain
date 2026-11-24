"""The patient registry: search, registration, profiles and patient-portal access."""

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import workflows
from app.deps import AcquiringUser, ClinicalStaff, DbDep, ServicesDep
from app.models import Role, Study, User, UTCDateTime
from app.presenters import patient_out
from app.schemas import Limit, PatientCreate, PatientOut, PortalEnabled, PortalRequest
from app.services import Services

router = APIRouter(prefix="/patients", tags=["patients"])


async def _related_ids(svc: Services, db: AsyncSession, user: User) -> set[str] | None:
    """Patients a referring doctor may look up: referred by them or shared with them.
    None means the whole registry (technicians and radiologists)."""
    if user.role is not Role.DOCTOR:
        return None
    referred = await db.scalars(select(Study.patient_id).where(Study.referrer_id == user.id))
    return set(referred.all()) | await workflows.shared_patient_ids(svc, db, user)


async def _with_counts(db: AsyncSession, patients: list[User]) -> list[PatientOut]:
    if not patients:
        return []
    rows = await db.execute(
        select(
            Study.patient_id,
            func.count(),
            func.max(Study.created_at, type_=UTCDateTime()),
        )
        .where(Study.patient_id.in_([p.id for p in patients]))
        .group_by(Study.patient_id)
    )
    counts = {pid: (count, last) for pid, count, last in rows.all()}
    return [patient_out(p, *counts.get(p.id, (0, None))) for p in patients]


@router.get("")
async def search_patients(
    user: ClinicalStaff,
    svc: ServicesDep,
    db: DbDep,
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Limit = 25,
) -> list[PatientOut]:
    query = select(User).where(User.org_id == user.org_id, User.role == Role.PATIENT)
    related = await _related_ids(svc, db, user)
    if related is not None:
        query = query.where(User.id.in_(related))
    if term := q.strip():
        digits = "".join(ch for ch in term if ch.isdigit())
        conditions = [User.name.ilike(f"%{term}%"), User.uhid.ilike(f"%{term}%")]
        if len(digits) >= 4:
            conditions.append(User.phone.like(f"%{digits}%"))
        query = query.where(or_(*conditions))
    patients = (await db.scalars(query.order_by(User.created_at.desc()).limit(limit))).unique()
    return await _with_counts(db, list(patients.all()))


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_patient(
    body: PatientCreate, actor: AcquiringUser, svc: ServicesDep, db: DbDep
) -> PatientOut:
    patient = await workflows.register_patient(
        svc,
        db,
        org=actor.organization,
        actor=actor,
        name=body.name,
        sex=body.sex,
        date_of_birth=body.date_of_birth,
        phone=body.phone,
        abha_number=body.abha_number,
    )
    return patient_out(patient)


@router.get("/{patient_id}")
async def get_patient(
    patient_id: str, user: ClinicalStaff, svc: ServicesDep, db: DbDep
) -> PatientOut:
    patient = await workflows.org_patient(db, user.org_id, patient_id)
    related = await _related_ids(svc, db, user)
    if related is not None and patient.id not in related:
        raise workflows.not_found("Patient")
    return (await _with_counts(db, [patient]))[0]


@router.post("/{patient_id}/portal")
async def enable_portal(
    patient_id: str, body: PortalRequest, actor: AcquiringUser, db: DbDep
) -> PortalEnabled:
    """Give the patient access to the patient portal with a one-time temporary password."""
    patient = await workflows.org_patient(db, actor.org_id, patient_id)
    temporary = await workflows.enable_portal(db, patient=patient, email=body.email, actor=actor)
    return PortalEnabled(
        patient=(await _with_counts(db, [patient]))[0], temporary_password=temporary
    )
