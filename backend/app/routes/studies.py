from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import workflows
from app.catalog import Discipline
from app.deps import (
    AcquiringUser,
    DbDep,
    ReporterUser,
    ServicesDep,
    StudyViewer,
    enforce_rate_limit,
)
from app.imaging import decode_scan, read_upload
from app.ml.catalog import AnalysisTypeId
from app.models import (
    REPORTING_DISCIPLINE,
    AuditEvent,
    Priority,
    Role,
    Site,
    Study,
    StudyStatus,
    User,
)
from app.presenters import audit_event, study_detail, study_summary
from app.schemas import (
    AuditEventOut,
    FileKind,
    LabStudyCreate,
    Limit,
    Offset,
    PublishRequest,
    StudyDetail,
    StudySummary,
)
from app.services import Services
from app.workflows import View

router = APIRouter(prefix="/studies", tags=["studies"])

_EXTENSIONS = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/json": "json",
}
OptionalForm = Annotated[str | None, Form(max_length=300)]


async def _visible_study(
    svc: Services, db: AsyncSession, user: User, study_id: str
) -> tuple[Study, View]:
    study = await db.get(Study, study_id)
    view = await workflows.study_view(svc, user, study) if study else None
    # Unauthorized and missing look the same, so study IDs cannot be probed.
    if study is None or view is None:
        raise workflows.not_found()
    return study, view


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_study(
    patient_id: Annotated[str, Form(max_length=36)],
    analysis_type: Annotated[AnalysisTypeId, Form()],
    file: Annotated[UploadFile, File(description="PNG or JPEG scan")],
    actor: AcquiringUser,
    svc: ServicesDep,
    db: DbDep,
    priority: Annotated[Priority, Form()] = Priority.ROUTINE,
    site_id: Annotated[str | None, Form(max_length=36)] = None,
    indication: OptionalForm = None,
    referrer_id: Annotated[str | None, Form(max_length=36)] = None,
    referrer_name: Annotated[str | None, Form(max_length=100)] = None,
) -> StudyDetail:
    """Store a newly acquired scan, run the AI pre-read and add it to the reporting worklist."""
    _check_discipline(actor, Discipline.RADIOLOGY)
    enforce_rate_limit(svc.limits.analysis, actor.id)
    patient = await workflows.org_patient(db, actor.org_id, patient_id)
    site = await _site_for(db, actor, site_id)
    referrer = await _referrer(db, actor, referrer_id)
    data = await read_upload(file, svc.settings.max_upload_bytes)
    study = await workflows.create_study(
        svc,
        db,
        actor=actor,
        patient=patient,
        site=site,
        analysis_type=analysis_type,
        priority=priority,
        scan=decode_scan(data),
        indication=(indication or "").strip() or None,
        referrer=referrer,
        referrer_name=(referrer_name or "").strip() or None,
    )
    return study_detail(study, await workflows.study_view(svc, actor, study) or View.STATUS)


@router.post("/lab", status_code=status.HTTP_201_CREATED)
async def create_lab_study(
    body: LabStudyCreate, actor: AcquiringUser, svc: ServicesDep, db: DbDep
) -> StudyDetail:
    """Record a laboratory panel's results, flag them against reference intervals and add the
    study to the pathologist's worklist."""
    _check_discipline(actor, Discipline.LABORATORY)
    patient = await workflows.org_patient(db, actor.org_id, body.patient_id)
    site = await _site_for(db, actor, body.site_id)
    referrer = await _referrer(db, actor, body.referrer_id)
    study = await workflows.create_lab_study(
        svc,
        db,
        actor=actor,
        patient=patient,
        site=site,
        panel_id=body.panel,
        priority=body.priority,
        values=dict(body.values),
        indication=(body.indication or "").strip() or None,
        referrer=referrer,
        referrer_name=(body.referrer_name or "").strip() or None,
    )
    return study_detail(study, await workflows.study_view(svc, actor, study) or View.STATUS)


def _check_discipline(actor: User, discipline: Discipline) -> None:
    """Technicians acquire anything; a reporting doctor acquires only for their own discipline."""
    own = REPORTING_DISCIPLINE.get(actor.role)
    if own is not None and own is not discipline:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot add this kind of study.")


async def _referrer(db: AsyncSession, actor: User, referrer_id: str | None) -> User | None:
    if not referrer_id:
        return None
    referrer = await workflows.find_clinician(db, actor.org_id, referrer_id)
    if referrer.role is not Role.DOCTOR:
        raise workflows.not_found("Doctor")
    return referrer


async def _site_for(db: AsyncSession, actor: User, site_id: str | None) -> Site:
    if site_id:
        return await workflows.org_site(db, actor.org_id, site_id)
    if actor.site_id:
        return await workflows.org_site(db, actor.org_id, actor.site_id)
    site = await db.scalar(
        select(Site).where(Site.org_id == actor.org_id, Site.is_active.is_(True)).limit(1)
    )
    if site is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add a site before acquiring studies.")
    return site


@router.get("")
async def list_studies(
    user: StudyViewer,
    svc: ServicesDep,
    db: DbDep,
    status_filter: Annotated[StudyStatus | None, Query(alias="status")] = None,
    priority: Priority | None = None,
    site_id: str | None = None,
    patient_id: str | None = None,
    critical: bool | None = None,
    since: datetime | None = None,
    q: Annotated[str, Query(max_length=100)] = "",
    order: Literal["recent", "worklist"] = "recent",
    limit: Limit = 50,
    offset: Offset = 0,
) -> list[StudySummary]:
    shared = await workflows.shared_patient_ids(svc, db, user)
    studies = await workflows.visible_studies(
        db,
        user,
        shared,
        status_filter=status_filter,
        priority=priority,
        site_id=site_id,
        patient_id=patient_id,
        critical=critical,
        since=since,
        search=q,
        worklist_order=order == "worklist",
        limit=limit,
        offset=offset,
    )
    return [study_summary(s, workflows.list_view(user, s, shared)) for s in studies]


@router.get("/{study_id}")
async def get_study(study_id: str, user: StudyViewer, svc: ServicesDep, db: DbDep) -> StudyDetail:
    study, view = await _visible_study(svc, db, user, study_id)
    return study_detail(study, view)


@router.post("/{study_id}/publish")
async def publish_study(
    study_id: str, body: PublishRequest, reporter: ReporterUser, svc: ServicesDep, db: DbDep
) -> StudyDetail:
    """Sign the report, render the PDF, store both files encrypted and anchor them on-chain."""
    study, _ = await _visible_study(svc, db, reporter, study_id)
    enforce_rate_limit(svc.limits.chain_write, reporter.id)
    study = await workflows.publish_study(
        svc,
        db,
        study=study,
        reporter=reporter,
        final_finding=body.final_finding,
        findings=body.findings or None,
        impression=body.impression,
        critical=body.critical,
    )
    return study_detail(study, View.FULL)


@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_study(study_id: str, actor: AcquiringUser, svc: ServicesDep, db: DbDep) -> None:
    study, _ = await _visible_study(svc, db, actor, study_id)
    reporter = REPORTING_DISCIPLINE.get(actor.role) is study.discipline
    mine = study.created_by_id == actor.id or reporter
    if study.status is not StudyStatus.DRAFT or not mine:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only unreported studies can be discarded.")
    await workflows.discard_draft(db, study=study, actor=actor)


@router.get(
    "/{study_id}/files/{kind}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}, "image/png": {}, "image/jpeg": {}}}},
)
async def get_study_file(
    study_id: str, kind: FileKind, user: StudyViewer, svc: ServicesDep, db: DbDep
) -> Response:
    """Decrypt and return a study file. For reported studies the contract authorizes the read."""
    enforce_rate_limit(svc.limits.file_read, user.id)
    study, view = await _visible_study(svc, db, user, study_id)
    content, media_type = await workflows.read_study_file(
        svc, db, study=study, user=user, kind=kind, view=view
    )
    filename = f"{study.accession}-{kind}.{_EXTENSIONS.get(media_type, 'bin')}"
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{study_id}/activity")
async def study_activity(
    study_id: str, user: StudyViewer, svc: ServicesDep, db: DbDep
) -> list[AuditEventOut]:
    """Who acquired, reported and opened this study. Visible to anyone with full access."""
    study, view = await _visible_study(svc, db, user, study_id)
    if view is not View.FULL:
        raise workflows.not_found()
    events = await db.scalars(
        select(AuditEvent)
        .where(AuditEvent.study_id == study.id)
        .order_by(AuditEvent.at.desc(), AuditEvent.id.desc())
        .limit(100)
    )
    return [audit_event(e) for e in events.unique().all()]
