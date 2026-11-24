"""Business workflows: organizations, patients, studies, sharing and accounts. Routes and the
seed script call these; this is where the access rules live.

Everything is scoped to the signed-in user's organization. For published studies the contract
remains the authority: it decides who may read a record (the patient, the reporting doctor,
the referring doctor and anyone the patient has shared with).
"""

import asyncio
import hashlib
import io
import json
import secrets
from collections import defaultdict
from datetime import UTC, date, datetime
from enum import StrEnum

from fastapi import HTTPException, status
from PIL import Image
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError as DbIntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import audit, labs
from app.audit import Action
from app.auth import hash_password
from app.catalog import DEPARTMENT, STUDY_TYPES, Discipline
from app.crypto import IntegrityError, seal, unseal
from app.imaging import Scan, decode_scan
from app.ml.engine import Prediction
from app.models import (
    CLINICIAN_ROLES,
    REPORTING_DISCIPLINE,
    WALLET_ROLES,
    Organization,
    OrgKind,
    Priority,
    Role,
    Sex,
    Site,
    SiteKind,
    Study,
    StudyStatus,
    User,
    new_id,
)
from app.report import Letterhead, ReportInput, render_report
from app.services import Services

_publish_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def not_found(what: str = "Study") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found.")


def forbidden(message: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, message)


def wallet(user: User) -> str:
    if not user.wallet_address:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account has no wallet.")
    return user.wallet_address


# Organizations and sites


async def create_organization(
    db: AsyncSession,
    *,
    name: str,
    short_name: str,
    kind: OrgKind,
    uhid_prefix: str,
    **details: str | None,
) -> Organization:
    org = Organization(
        id=new_id(),
        name=name,
        short_name=short_name,
        kind=kind,
        uhid_prefix=uhid_prefix.upper(),
        **details,
    )
    db.add(org)
    await db.flush()
    return org


async def create_site(
    db: AsyncSession,
    *,
    org_id: str,
    name: str,
    code: str,
    kind: SiteKind,
    city: str | None = None,
    actor: User | None = None,
) -> Site:
    code = code.strip().upper()
    if await db.scalar(select(Site.id).where(Site.org_id == org_id, Site.code == code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A site with this code already exists.")
    site = Site(id=new_id(), org_id=org_id, name=name, code=code, kind=kind, city=city)
    db.add(site)
    await db.flush()
    if actor:
        audit.record(db, Action.SITE_CREATED, actor=actor, detail=code)
    return site


async def org_site(db: AsyncSession, org_id: str, site_id: str) -> Site:
    site = await db.get(Site, site_id)
    if site is None or site.org_id != org_id or not site.is_active:
        raise not_found("Site")
    return site


# Access policy


class View(StrEnum):
    """How much of a study a user may see. Status-only views carry no clinical content."""

    FULL = "full"
    STATUS = "status"


async def study_view(svc: Services, user: User, study: Study) -> View | None:
    """None if the user may not see the study at all."""
    if study.org_id != user.org_id:
        return None
    published = study.status is StudyStatus.PUBLISHED
    match user.role:
        case Role.PATIENT:
            return View.FULL if published and study.patient_id == user.id else None
        case Role.TECHNICIAN:
            return View.STATUS
        case Role.RADIOLOGIST | Role.PATHOLOGIST:
            if not published:
                # Any reporter of the study's discipline in the organization can report a draft.
                own = study.discipline == REPORTING_DISCIPLINE[user.role]
                return View.FULL if own else View.STATUS
            return View.FULL if await _chain_allows(svc, user, study) else View.STATUS
        case Role.DOCTOR:
            if published and await _chain_allows(svc, user, study):
                return View.FULL
            return View.STATUS if study.referrer_id == user.id else None
        case _:
            return None


async def _chain_allows(svc: Services, user: User, study: Study) -> bool:
    if not study.record_id or not user.wallet_address:
        return False
    return await svc.registry.can_access(study.record_id, user.wallet_address)


def list_view(user: User, study: Study, shared_patient_ids: set[str]) -> View:
    """The view for a study in a list the user already may see. It mirrors the contract's rules
    (issuer, referrer, shared patient) so a list needs no per-row chain calls; opening a study
    still asks the contract."""
    if user.role is Role.PATIENT:
        return View.FULL
    if user.role is Role.TECHNICIAN:
        return View.STATUS
    discipline = REPORTING_DISCIPLINE.get(user.role)
    if study.status is StudyStatus.DRAFT:
        return View.FULL if study.discipline == discipline else View.STATUS
    own = study.reporter_id if discipline else study.referrer_id
    return View.FULL if own == user.id or study.patient_id in shared_patient_ids else View.STATUS


async def shared_patient_ids(svc: Services, db: AsyncSession, user: User) -> set[str]:
    """Patients who have shared their records with this clinician on-chain."""
    if user.role not in CLINICIAN_ROLES:
        return set()
    addresses = await svc.registry.patients_of(wallet(user))
    if not addresses:
        return set()
    ids = await db.scalars(
        select(User.id).where(User.org_id == user.org_id, User.wallet_address.in_(addresses))
    )
    return set(ids.all())


PRIORITY_ORDER = case(
    (Study.priority == Priority.STAT, 0), (Study.priority == Priority.URGENT, 1), else_=2
)


async def visible_studies(
    db: AsyncSession,
    user: User,
    shared: set[str],
    *,
    status_filter: StudyStatus | None = None,
    priority: Priority | None = None,
    site_id: str | None = None,
    patient_id: str | None = None,
    critical: bool | None = None,
    since: datetime | None = None,
    search: str = "",
    worklist_order: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Study]:
    query = select(Study).where(Study.org_id == user.org_id)
    match user.role:
        case Role.PATIENT:
            query = query.where(Study.patient_id == user.id, Study.status == StudyStatus.PUBLISHED)
        case Role.TECHNICIAN:
            pass
        case Role.RADIOLOGIST | Role.PATHOLOGIST | Role.DOCTOR:
            discipline = REPORTING_DISCIPLINE.get(user.role)
            own = (
                or_(
                    (Study.status == StudyStatus.DRAFT) & (Study.discipline == discipline),
                    Study.reporter_id == user.id,
                )
                if discipline
                else Study.referrer_id == user.id
            )
            query = query.where(
                or_(own, (Study.status == StudyStatus.PUBLISHED) & Study.patient_id.in_(shared))
            )
        case _:
            return []
    if status_filter:
        query = query.where(Study.status == status_filter)
    if priority:
        query = query.where(Study.priority == priority)
    if site_id:
        query = query.where(Study.site_id == site_id)
    if patient_id:
        query = query.where(Study.patient_id == patient_id)
    if critical is not None:
        query = query.where(Study.critical.is_(critical))
    if since:
        query = query.where(Study.created_at >= since)
    if term := search.strip():
        matching = select(User.id).where(
            User.org_id == user.org_id,
            User.role == Role.PATIENT,
            or_(User.name.ilike(f"%{term}%"), User.uhid.ilike(f"%{term}%")),
        )
        query = query.where(or_(Study.patient_id.in_(matching), Study.accession.ilike(f"%{term}%")))
    if worklist_order:
        query = query.order_by(PRIORITY_ORDER, Study.created_at.asc())
    else:
        query = query.order_by(Study.created_at.desc())
    query = query.limit(limit).offset(offset)
    return list((await db.scalars(query)).unique().all())


# Patients


async def next_uhid(db: AsyncSession, org: Organization, on: date) -> str:
    count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.org_id == org.id, User.role == Role.PATIENT)
    )
    return f"{org.uhid_prefix}-{on:%y}-{(count or 0) + 1:06d}"


async def register_patient(
    svc: Services,
    db: AsyncSession,
    *,
    org: Organization,
    actor: User | None,
    name: str,
    sex: Sex,
    date_of_birth: date,
    phone: str | None = None,
    abha_number: str | None = None,
    email: str | None = None,
    password: str | None = None,
    registered_at: datetime | None = None,
    wallet_private_key: str | None = None,
) -> User:
    """Register a patient. Portal access is optional and needs both an email and a password."""
    when = registered_at or datetime.now(UTC)
    if email:
        email = await _unused_email(db, email)
    patient = User(
        id=new_id(),
        organization=org,
        role=Role.PATIENT,
        name=name,
        sex=sex,
        date_of_birth=date_of_birth,
        phone=normalize_phone(phone),
        abha_number=abha_number,
        uhid=await next_uhid(db, org, when.date()),
        email=email if password else None,
        password_hash=await run_in_threadpool(hash_password, password) if password else None,
        created_at=when,
    )
    if wallet_private_key:
        svc.vault.import_key(patient, wallet_private_key)
    else:
        svc.vault.create(patient)
    db.add(patient)
    try:
        await db.flush()
    except DbIntegrityError as exc:  # a concurrent registration took the same UHID
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Please try registering again.") from exc
    audit.record(db, Action.PATIENT_REGISTERED, actor=actor, target=patient, org_id=org.id, at=when)
    await db.commit()
    return patient


def normalize_phone(phone: str | None) -> str | None:
    """Digits only (with a leading + if given), so searching for any part of it works."""
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    return f"+{digits}" if phone.strip().startswith("+") else digits


async def enable_portal(db: AsyncSession, *, patient: User, email: str, actor: User) -> str:
    """Give a patient portal access. Returns a one-time temporary password."""
    if patient.portal_access:
        raise HTTPException(status.HTTP_409_CONFLICT, "This patient already has portal access.")
    patient.email = await _unused_email(db, email)
    temporary = secrets.token_urlsafe(12)
    patient.password_hash = await run_in_threadpool(hash_password, temporary)
    audit.record(db, Action.PORTAL_ENABLED, actor=actor, target=patient)
    await db.commit()
    return temporary


async def org_patient(db: AsyncSession, org_id: str, patient_id: str) -> User:
    patient = await db.get(User, patient_id)
    if patient is None or patient.org_id != org_id or patient.role is not Role.PATIENT:
        raise not_found("Patient")
    return patient


async def _unused_email(db: AsyncSession, email: str) -> str:
    email = email.strip().lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    return email


# Studies


async def next_accession(db: AsyncSession, org_id: str, on: datetime) -> str:
    # The day's highest number, not a count, so a discarded draft never causes a collision.
    prefix = f"ACC-{on:%y%m%d}-"
    last = await db.scalar(
        select(func.max(Study.accession)).where(
            Study.org_id == org_id, Study.accession.like(f"{prefix}%")
        )
    )
    return f"{prefix}{int(last.removeprefix(prefix)) + 1 if last else 1:04d}"


async def create_study(
    svc: Services,
    db: AsyncSession,
    *,
    actor: User,
    patient: User,
    site: Site,
    analysis_type: str,
    priority: Priority,
    scan: Scan,
    indication: str | None = None,
    referrer: User | None = None,
    referrer_name: str | None = None,
    acquired_at: datetime | None = None,
) -> Study:
    """Store a newly acquired scan, run the AI pre-read and queue it for reporting."""
    inference = await run_in_threadpool(svc.ml.predict, analysis_type, scan.image)
    key = svc.settings.encryption_key_bytes
    when = acquired_at or datetime.now(UTC)
    study = Study(
        id=new_id(),
        org_id=actor.org_id,
        site=site,
        accession=await next_accession(db, actor.org_id, when),
        patient=patient,
        created_by=actor,
        referrer=referrer,
        referrer_name=None if referrer else referrer_name,
        analysis_type=analysis_type,
        discipline=Discipline.RADIOLOGY,
        priority=priority,
        indication=indication,
        status=StudyStatus.DRAFT,
        model_id=inference.model_id,
        predictions=[{"label": p.label, "score": p.score} for p in inference.predictions],
        scan_media_type=scan.media_type,
        scan_sha256=hashlib.sha256(scan.data).hexdigest(),
        created_at=when,
    )
    study.draft_scan = seal(key, scan.data, kind="scan", subject=study.id)
    if inference.heatmap is not None:
        study.heatmap = seal(key, _png(inference.heatmap), kind="heatmap", subject=study.id)
    db.add(study)
    await db.flush()  # the audit row references the study, so it must exist first
    audit.record(db, Action.STUDY_CREATED, actor=actor, study_id=study.id, target=patient, at=when)
    await db.commit()
    return study


# The "model" behind a lab study's suggested finding: reference intervals, not machine learning.
LAB_FLAGGING = "reference-intervals"


async def create_lab_study(
    svc: Services,
    db: AsyncSession,
    *,
    actor: User,
    patient: User,
    site: Site,
    panel_id: str,
    priority: Priority,
    values: dict[str, object],
    indication: str | None = None,
    referrer: User | None = None,
    referrer_name: str | None = None,
    collected_at: datetime | None = None,
) -> Study:
    """Store a laboratory panel's results, flag them against reference intervals and queue the
    study for a pathologist. The submitted values are the study's sealed source data."""
    panel = labs.LAB_PANELS[panel_id]
    try:
        results = labs.evaluate(panel, values, patient.sex)
    except labs.LabValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    source = json.dumps(
        {"panel": panel.id, "values": {r.code: r.value for r in results}}, sort_keys=True
    ).encode()
    key = svc.settings.encryption_key_bytes
    when = collected_at or datetime.now(UTC)
    study = Study(
        id=new_id(),
        org_id=actor.org_id,
        site=site,
        accession=await next_accession(db, actor.org_id, when),
        patient=patient,
        created_by=actor,
        referrer=referrer,
        referrer_name=None if referrer else referrer_name,
        analysis_type=panel.id,
        discipline=Discipline.LABORATORY,
        priority=priority,
        indication=indication,
        status=StudyStatus.DRAFT,
        model_id=LAB_FLAGGING,
        predictions=[{"label": labs.suggest(panel, results), "score": 1.0}],
        results=[r.as_dict() for r in results],
        scan_media_type="application/json",
        scan_sha256=hashlib.sha256(source).hexdigest(),
        created_at=when,
    )
    study.draft_scan = seal(key, source, kind="scan", subject=study.id)
    db.add(study)
    await db.flush()
    audit.record(db, Action.STUDY_CREATED, actor=actor, study_id=study.id, target=patient, at=when)
    await db.commit()
    return study


async def publish_study(
    svc: Services,
    db: AsyncSession,
    *,
    study: Study,
    reporter: User,
    final_finding: str,
    impression: str,
    findings: str | None = None,
    critical: bool = False,
    published_at: datetime | None = None,
) -> Study:
    """Sign the report, render the PDF, store both files encrypted and anchor them on-chain."""
    async with _publish_locks[study.id]:
        await db.refresh(study)
        if study.status is not StudyStatus.DRAFT or study.draft_scan is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This study has already been reported.")
        if REPORTING_DISCIPLINE.get(reporter.role) != study.discipline:
            signer = "pathologist" if study.discipline is Discipline.LABORATORY else "radiologist"
            raise forbidden(f"Only a {signer} can sign this report.")
        if not await svc.registry.is_clinician(wallet(reporter)):
            raise forbidden("Your account is not verified on the registry yet.")

        key = svc.settings.encryption_key_bytes
        scan = heatmap = None
        if study.discipline is Discipline.RADIOLOGY:
            scan = decode_scan(unseal(key, study.draft_scan, kind="scan", subject=study.id)).image
            if study.heatmap:
                sealed = unseal(key, study.heatmap, kind="heatmap", subject=study.id)
                heatmap = Image.open(io.BytesIO(sealed))
        org = reporter.organization
        analysis = STUDY_TYPES[study.analysis_type]
        record_id = "0x" + secrets.token_hex(32)
        signed_at = published_at or datetime.now(UTC)
        app_url = svc.settings.public_app_url.rstrip("/")
        referrer = study.referrer if study.referrer and study.referrer.is_active else None
        pdf = await run_in_threadpool(
            render_report,
            ReportInput(
                letterhead=Letterhead(
                    name=org.name,
                    department=DEPARTMENT.get(study.discipline, org.department),
                    address=", ".join(p for p in (org.address, org.city) if p),
                    contact=" · ".join(p for p in (org.phone, org.email) if p),
                    accreditation=org.accreditation,
                    timezone=org.timezone,
                ),
                record_id=record_id,
                accession=study.accession,
                site_name=study.site.name,
                published_at=signed_at,
                acquired_at=study.created_at,
                patient_name=study.patient.name,
                patient_uhid=study.patient.reference,
                patient_sex=study.patient.sex,
                patient_dob=study.patient.date_of_birth,
                referred_by=referrer.name if referrer else study.referrer_name,
                priority=study.priority,
                indication=study.indication,
                analysis_name=analysis.name,
                modality=analysis.modality,
                model_id=study.model_id,
                predictions=[
                    Prediction(str(p["label"]), float(p["score"])) for p in study.predictions
                ],
                final_finding=final_finding,
                findings=findings,
                impression=impression,
                critical=critical,
                reporter_name=reporter.name,
                reporter_title=reporter.title,
                reporter_qualification=reporter.qualification,
                reporter_registration=reporter.registration_number,
                scan=scan,
                heatmap=heatmap,
                lab_results=study.results,
                scan_sha256=study.scan_sha256,
                verify_url=f"{app_url}/verify?record={record_id}",
            ),
        )
        report_sha256 = hashlib.sha256(pdf).hexdigest()
        scan_cid, report_cid = await asyncio.gather(
            svc.storage.add(study.draft_scan, f"medichain-scan-{study.id}.bin"),
            svc.storage.add(
                seal(key, pdf, kind="report", subject=study.id), f"medichain-report-{study.id}.bin"
            ),
        )
        tx_hash = await svc.registry.publish_record(
            svc.vault.signer(reporter),
            record_id,
            wallet(study.patient),
            referrer.wallet_address if referrer else None,
            report_sha256,
            scan_cid,
            report_cid,
        )

        study.status = StudyStatus.PUBLISHED
        study.reporter = reporter
        study.final_finding = final_finding
        study.findings = findings
        study.impression = impression
        study.critical = critical
        study.published_at = signed_at
        study.record_id = record_id
        study.scan_cid = scan_cid
        study.report_cid = report_cid
        study.report_sha256 = report_sha256
        study.tx_hash = tx_hash
        study.draft_scan = None
        audit.record(
            db,
            Action.STUDY_PUBLISHED,
            actor=reporter,
            study_id=study.id,
            target=study.patient,
            tx_hash=tx_hash,
            at=signed_at,
        )
        if critical:
            audit.record(
                db,
                Action.CRITICAL_FINDING,
                actor=reporter,
                study_id=study.id,
                target=referrer or study.patient,
                at=signed_at,
            )
        await db.commit()
    _publish_locks.pop(study.id, None)
    return study


async def discard_draft(db: AsyncSession, *, study: Study, actor: User) -> None:
    audit.record(
        db, Action.STUDY_DISCARDED, actor=actor, target=study.patient, detail=study.accession
    )
    await db.delete(study)
    await db.commit()


async def read_study_file(
    svc: Services, db: AsyncSession, *, study: Study, user: User, kind: str, view: View
) -> tuple[bytes, str]:
    key = svc.settings.encryption_key_bytes
    draft = study.status is StudyStatus.DRAFT
    # Technicians may check the image they acquired until it is reported; nothing else.
    if view is View.STATUS and not (draft and kind == "scan" and user.role is Role.TECHNICIAN):
        raise not_found("File")
    if kind == "heatmap":
        if study.heatmap is None:
            raise not_found("Heatmap")
        data = unseal(key, study.heatmap, kind="heatmap", subject=study.id)
        media_type = "image/png"
    elif draft:
        if kind == "report" or study.draft_scan is None:
            raise not_found("Report")
        data = unseal(key, study.draft_scan, kind="scan", subject=study.id)
        media_type = study.scan_media_type
    else:
        # The contract authorizes the read and is the source of truth for the CIDs and hash.
        record = await svc.registry.get_record(study.record_id or "", caller=wallet(user))
        cid = record.scan_cid if kind == "scan" else record.report_cid
        data = unseal(key, await svc.storage.cat(cid), kind=kind, subject=study.id)
        if kind == "report" and hashlib.sha256(data).hexdigest() != record.report_hash:
            raise IntegrityError("Report does not match its on-chain hash")
        media_type = "application/pdf" if kind == "report" else study.scan_media_type

    if not draft and kind != "heatmap":
        audit.record(
            db, Action.FILE_VIEWED, actor=user, study_id=study.id, target=study.patient, detail=kind
        )
        await db.commit()
    return data, media_type


# Sharing


async def care_team(svc: Services, db: AsyncSession, patient: User) -> list[User]:
    addresses = await svc.registry.clinicians_of(wallet(patient))
    if not addresses:
        return []
    users = await db.scalars(select(User).where(User.wallet_address.in_(addresses)))
    return sorted(users.unique().all(), key=lambda u: u.name)


async def find_clinician(db: AsyncSession, org_id: str, clinician_id: str) -> User:
    clinician = await db.get(User, clinician_id)
    if (
        clinician is None
        or clinician.org_id != org_id
        or clinician.role not in CLINICIAN_ROLES
        or not clinician.is_active
    ):
        raise not_found("Doctor")
    return clinician


async def grant_access(
    svc: Services, db: AsyncSession, *, patient: User, clinician: User, at: datetime | None = None
) -> None:
    tx_hash = await svc.registry.grant_access(svc.vault.signer(patient), wallet(clinician))
    audit.record(db, Action.ACCESS_GRANTED, actor=patient, target=clinician, tx_hash=tx_hash, at=at)
    await db.commit()


async def revoke_access(svc: Services, db: AsyncSession, *, patient: User, clinician: User) -> None:
    tx_hash = await svc.registry.revoke_access(svc.vault.signer(patient), wallet(clinician))
    audit.record(db, Action.ACCESS_REVOKED, actor=patient, target=clinician, tx_hash=tx_hash)
    await db.commit()


# Staff accounts


async def create_staff(
    svc: Services,
    db: AsyncSession,
    *,
    org_id: str,
    name: str,
    email: str,
    role: Role,
    password: str,
    title: str | None = None,
    qualification: str | None = None,
    registration_number: str | None = None,
    site_id: str | None = None,
    phone: str | None = None,
    actor: User | None = None,
    wallet_private_key: str | None = None,
) -> User:
    if role is Role.PATIENT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Register patients instead.")
    site = await org_site(db, org_id, site_id) if site_id else None
    organization = await db.get(Organization, org_id)
    clinical = role in CLINICIAN_ROLES
    user = User(
        id=new_id(),
        organization=organization,
        site=site,
        email=await _unused_email(db, email),
        name=name,
        role=role,
        title=title,
        qualification=qualification if clinical else None,
        registration_number=registration_number if clinical else None,
        phone=phone,
        password_hash=await run_in_threadpool(hash_password, password),
    )
    if role in WALLET_ROLES:
        if wallet_private_key:
            svc.vault.import_key(user, wallet_private_key)
        else:
            svc.vault.create(user)
    tx_hash = await svc.registry.set_clinician(wallet(user), True) if clinical else None
    db.add(user)
    await db.flush()
    audit.record(
        db,
        Action.USER_CREATED,
        actor=actor,
        target=user,
        detail=role.value,
        tx_hash=tx_hash,
        org_id=org_id,
    )
    await db.commit()
    return user


async def set_user_active(
    svc: Services, db: AsyncSession, *, user: User, active: bool, actor: User
) -> None:
    if user.id == actor.id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "You cannot deactivate your own account."
        )
    if user.is_active == active:
        return
    tx_hash = None
    if user.role in CLINICIAN_ROLES:
        tx_hash = await svc.registry.set_clinician(wallet(user), active)
    user.is_active = active
    if not active:
        await svc.sessions.revoke_all(db, user.id)
    action = Action.USER_REACTIVATED if active else Action.USER_DEACTIVATED
    audit.record(db, action, actor=actor, target=user, tx_hash=tx_hash)
    await db.commit()


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
