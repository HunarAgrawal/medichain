"""Business workflows: studies, sharing and accounts. Routes and the seed script call these;
this is where the access rules live."""

import asyncio
import hashlib
import io
import secrets
from collections import defaultdict
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from PIL import Image
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import audit
from app.audit import Action
from app.auth import hash_password
from app.crypto import IntegrityError, seal, unseal
from app.imaging import Scan, decode_scan
from app.ml.catalog import ANALYSIS_TYPES
from app.ml.engine import Prediction
from app.models import Role, Study, StudyStatus, User, new_id
from app.report import ReportInput, render_report
from app.services import Services

_publish_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def not_found(what: str = "Study") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found.")


def wallet(user: User) -> str:
    if not user.wallet_address:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account has no wallet.")
    return user.wallet_address


# Access policy


async def can_view_study(svc: Services, user: User, study: Study) -> bool:
    if user.role is Role.PATIENT:
        return study.patient_id == user.id and study.status is StudyStatus.PUBLISHED
    if user.role is Role.CLINICIAN:
        if study.status is StudyStatus.DRAFT:
            return study.clinician_id == user.id
        return bool(study.record_id) and await svc.registry.can_access(
            study.record_id or "", wallet(user)
        )
    return False


async def visible_studies(
    svc: Services,
    db: AsyncSession,
    user: User,
    *,
    status_filter: StudyStatus | None = None,
    patient_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Study]:
    query = select(Study)
    if user.role is Role.PATIENT:
        query = query.where(Study.patient_id == user.id, Study.status == StudyStatus.PUBLISHED)
    else:
        shared = await svc.registry.patients_of(wallet(user))
        shared_ids = select(User.id).where(User.wallet_address.in_(shared))
        query = query.where(
            or_(
                Study.clinician_id == user.id,
                (Study.status == StudyStatus.PUBLISHED) & Study.patient_id.in_(shared_ids),
            )
        )
    if status_filter:
        query = query.where(Study.status == status_filter)
    if patient_id:
        query = query.where(Study.patient_id == patient_id)
    query = query.order_by(Study.created_at.desc()).limit(limit).offset(offset)
    return list((await db.scalars(query)).unique().all())


# Studies


async def create_draft(
    svc: Services,
    db: AsyncSession,
    *,
    clinician: User,
    patient: User,
    analysis_type: str,
    scan: Scan,
) -> Study:
    inference = await run_in_threadpool(svc.ml.predict, analysis_type, scan.image)
    key = svc.settings.encryption_key_bytes
    study = Study(
        id=new_id(),
        patient=patient,
        clinician=clinician,
        analysis_type=analysis_type,
        status=StudyStatus.DRAFT,
        model_id=inference.model_id,
        predictions=[{"label": p.label, "score": p.score} for p in inference.predictions],
        scan_media_type=scan.media_type,
        scan_sha256=hashlib.sha256(scan.data).hexdigest(),
    )
    study.draft_scan = seal(key, scan.data, kind="scan", subject=study.id)
    if inference.heatmap is not None:
        study.heatmap = seal(key, _png(inference.heatmap), kind="heatmap", subject=study.id)
    db.add(study)
    await db.flush()  # the audit row references the study, so it must exist first
    audit.record(db, Action.STUDY_CREATED, actor=clinician, study_id=study.id, target=patient)
    await db.commit()
    return study


async def publish_study(
    svc: Services,
    db: AsyncSession,
    *,
    study: Study,
    clinician: User,
    final_finding: str,
    impression: str,
) -> Study:
    async with _publish_locks[study.id]:
        await db.refresh(study)
        if study.status is not StudyStatus.DRAFT or study.draft_scan is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This study has already been published.")
        if not await svc.registry.is_clinician(wallet(clinician)):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Your account is not verified on the registry yet."
            )

        key = svc.settings.encryption_key_bytes
        scan = decode_scan(unseal(key, study.draft_scan, kind="scan", subject=study.id))
        heatmap = (
            Image.open(io.BytesIO(unseal(key, study.heatmap, kind="heatmap", subject=study.id)))
            if study.heatmap
            else None
        )
        analysis = ANALYSIS_TYPES[study.analysis_type]
        record_id = "0x" + secrets.token_hex(32)
        published_at = datetime.now(UTC)
        app_url = svc.settings.public_app_url.rstrip("/")
        pdf = await run_in_threadpool(
            render_report,
            ReportInput(
                report_id=study.id,
                record_id=record_id,
                published_at=published_at,
                patient_name=study.patient.name,
                patient_reference=study.patient.reference,
                patient_dob=study.patient.date_of_birth,
                analysis_name=analysis.name,
                modality=analysis.modality,
                model_id=study.model_id,
                predictions=[
                    Prediction(str(p["label"]), float(p["score"])) for p in study.predictions
                ],
                final_finding=final_finding,
                impression=impression,
                clinician_name=clinician.name,
                clinician_title=clinician.title,
                scan=scan.image,
                heatmap=heatmap,
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
            svc.vault.signer(clinician),
            record_id,
            wallet(study.patient),
            report_sha256,
            scan_cid,
            report_cid,
        )

        study.status = StudyStatus.PUBLISHED
        study.final_finding = final_finding
        study.impression = impression
        study.published_at = published_at
        study.record_id = record_id
        study.scan_cid = scan_cid
        study.report_cid = report_cid
        study.report_sha256 = report_sha256
        study.tx_hash = tx_hash
        study.draft_scan = None
        audit.record(
            db,
            Action.STUDY_PUBLISHED,
            actor=clinician,
            study_id=study.id,
            target=study.patient,
            tx_hash=tx_hash,
        )
        await db.commit()
    _publish_locks.pop(study.id, None)
    return study


async def discard_draft(db: AsyncSession, *, study: Study, clinician: User) -> None:
    audit.record(db, Action.STUDY_DISCARDED, actor=clinician, target=study.patient)
    await db.delete(study)
    await db.commit()


async def read_study_file(
    svc: Services, db: AsyncSession, *, study: Study, user: User, kind: str
) -> tuple[bytes, str]:
    key = svc.settings.encryption_key_bytes
    if kind == "heatmap":
        if study.heatmap is None:
            raise not_found("Heatmap")
        data = unseal(key, study.heatmap, kind="heatmap", subject=study.id)
        media_type = "image/png"
    elif study.status is StudyStatus.DRAFT:
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

    if study.status is StudyStatus.PUBLISHED and kind != "heatmap":
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
    return sorted(users.all(), key=lambda u: u.name)


async def find_clinician(db: AsyncSession, clinician_id: str) -> User:
    clinician = await db.get(User, clinician_id)
    if clinician is None or clinician.role is not Role.CLINICIAN or not clinician.is_active:
        raise not_found("Clinician")
    return clinician


async def grant_access(svc: Services, db: AsyncSession, *, patient: User, clinician: User) -> None:
    tx_hash = await svc.registry.grant_access(svc.vault.signer(patient), wallet(clinician))
    audit.record(db, Action.ACCESS_GRANTED, actor=patient, target=clinician, tx_hash=tx_hash)
    await db.commit()


async def revoke_access(svc: Services, db: AsyncSession, *, patient: User, clinician: User) -> None:
    tx_hash = await svc.registry.revoke_access(svc.vault.signer(patient), wallet(clinician))
    audit.record(db, Action.ACCESS_REVOKED, actor=patient, target=clinician, tx_hash=tx_hash)
    await db.commit()


# Accounts


async def create_user(
    svc: Services,
    db: AsyncSession,
    *,
    name: str,
    email: str,
    role: Role,
    password: str,
    title: str | None = None,
    date_of_birth: date | None = None,
    actor: User | None = None,
    wallet_private_key: str | None = None,
) -> User:
    email = email.strip().lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(
        id=new_id(),
        email=email,
        name=name,
        role=role,
        title=title if role is not Role.PATIENT else None,
        date_of_birth=date_of_birth if role is Role.PATIENT else None,
        password_hash=await run_in_threadpool(hash_password, password),
    )
    if role in (Role.PATIENT, Role.CLINICIAN):
        if wallet_private_key:
            svc.vault.import_key(user, wallet_private_key)
        else:
            svc.vault.create(user)
    tx_hash = None
    if role is Role.CLINICIAN:
        tx_hash = await svc.registry.set_clinician(wallet(user), True)
    db.add(user)
    await db.flush()
    audit.record(
        db, Action.USER_CREATED, actor=actor, target=user, detail=role.value, tx_hash=tx_hash
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
    if user.role is Role.CLINICIAN:
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
