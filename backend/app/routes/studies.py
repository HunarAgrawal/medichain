from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import workflows
from app.deps import CareUser, ClinicianUser, DbDep, ServicesDep, enforce_rate_limit
from app.imaging import decode_scan, read_upload
from app.ml.catalog import AnalysisTypeId
from app.models import AuditEvent, Role, Study, StudyStatus, User
from app.presenters import audit_event, study_detail, study_summary
from app.schemas import (
    AuditEventOut,
    FileKind,
    Limit,
    Offset,
    PublishRequest,
    StudyDetail,
    StudySummary,
)
from app.services import Services

router = APIRouter(prefix="/studies", tags=["studies"])

_EXTENSIONS = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}


async def _visible_study(svc: Services, db: AsyncSession, user: User, study_id: str) -> Study:
    study = await db.get(Study, study_id)
    # Unauthorized and missing look the same, so study IDs cannot be probed.
    if study is None or not await workflows.can_view_study(svc, user, study):
        raise workflows.not_found()
    return study


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_study(
    patient_id: Annotated[str, Form(max_length=36)],
    analysis_type: Annotated[AnalysisTypeId, Form()],
    file: Annotated[UploadFile, File(description="PNG or JPEG scan")],
    clinician: ClinicianUser,
    svc: ServicesDep,
    db: DbDep,
) -> StudyDetail:
    """Run the AI analysis and save a draft for the clinician to review."""
    enforce_rate_limit(svc.limits.analysis, clinician.id)
    patient = await db.get(User, patient_id)
    if patient is None or patient.role is not Role.PATIENT or not patient.is_active:
        raise workflows.not_found("Patient")
    data = await read_upload(file, svc.settings.max_upload_bytes)
    study = await workflows.create_draft(
        svc,
        db,
        clinician=clinician,
        patient=patient,
        analysis_type=analysis_type,
        scan=decode_scan(data),
    )
    return study_detail(study)


@router.get("")
async def list_studies(
    user: CareUser,
    svc: ServicesDep,
    db: DbDep,
    status_filter: Annotated[StudyStatus | None, Query(alias="status")] = None,
    patient_id: str | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> list[StudySummary]:
    studies = await workflows.visible_studies(
        svc,
        db,
        user,
        status_filter=status_filter,
        patient_id=patient_id,
        limit=limit,
        offset=offset,
    )
    return [study_summary(s) for s in studies]


@router.get("/{study_id}")
async def get_study(study_id: str, user: CareUser, svc: ServicesDep, db: DbDep) -> StudyDetail:
    return study_detail(await _visible_study(svc, db, user, study_id))


@router.post("/{study_id}/publish")
async def publish_study(
    study_id: str, body: PublishRequest, clinician: ClinicianUser, svc: ServicesDep, db: DbDep
) -> StudyDetail:
    """Sign the review, render the report, store both files encrypted and anchor them on-chain."""
    study = await _visible_study(svc, db, clinician, study_id)
    if study.clinician_id != clinician.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the reporting clinician can publish.")
    enforce_rate_limit(svc.limits.chain_write, clinician.id)
    study = await workflows.publish_study(
        svc,
        db,
        study=study,
        clinician=clinician,
        final_finding=body.final_finding,
        impression=body.impression,
    )
    return study_detail(study)


@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_study(
    study_id: str, clinician: ClinicianUser, svc: ServicesDep, db: DbDep
) -> None:
    study = await _visible_study(svc, db, clinician, study_id)
    if study.status is not StudyStatus.DRAFT or study.clinician_id != clinician.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only your own drafts can be discarded.")
    await workflows.discard_draft(db, study=study, clinician=clinician)


@router.get(
    "/{study_id}/files/{kind}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}, "image/png": {}, "image/jpeg": {}}}},
)
async def get_study_file(
    study_id: str, kind: FileKind, user: CareUser, svc: ServicesDep, db: DbDep
) -> Response:
    """Decrypt and return a study file. For published studies the contract authorizes the read."""
    enforce_rate_limit(svc.limits.file_read, user.id)
    study = await _visible_study(svc, db, user, study_id)
    content, media_type = await workflows.read_study_file(
        svc, db, study=study, user=user, kind=kind
    )
    filename = f"medichain-{kind}-{study.id[:8]}.{_EXTENSIONS.get(media_type, 'bin')}"
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{study_id}/activity")
async def study_activity(
    study_id: str, user: CareUser, svc: ServicesDep, db: DbDep
) -> list[AuditEventOut]:
    """Who created, published and opened this study. Visible to the patient and the issuer."""
    study = await _visible_study(svc, db, user, study_id)
    if user.role is Role.CLINICIAN and study.clinician_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the patient and the reporting clinician can see this."
        )
    events = await db.scalars(
        select(AuditEvent)
        .where(AuditEvent.study_id == study.id)
        .order_by(AuditEvent.at.desc(), AuditEvent.id.desc())
        .limit(100)
    )
    return [audit_event(e) for e in events.unique().all()]
