"""Convert ORM objects to API response models."""

from app.ml.catalog import ANALYSIS_TYPES
from app.models import AuditEvent, Study, StudyStatus, User
from app.schemas import (
    AuditEventOut,
    PredictionOut,
    RecordInfo,
    StudyDetail,
    StudySummary,
    UserOut,
    UserSummary,
)


def user_summary(user: User) -> UserSummary:
    return UserSummary.model_validate(user)


def user_out(user: User) -> UserOut:
    return UserOut.model_validate(user)


def study_summary(study: Study) -> StudySummary:
    return StudySummary(**_summary_fields(study))


def study_detail(study: Study) -> StudyDetail:
    predictions = [
        PredictionOut(label=str(p["label"]), score=float(p["score"])) for p in study.predictions
    ]
    ai_top = predictions[0].label if predictions else None
    record = None
    if study.status is StudyStatus.PUBLISHED and study.record_id:
        record = RecordInfo(
            record_id=study.record_id,
            tx_hash=study.tx_hash or "",
            scan_cid=study.scan_cid or "",
            report_cid=study.report_cid or "",
            report_sha256=study.report_sha256 or "",
            scan_sha256=study.scan_sha256,
        )
    return StudyDetail(
        **_summary_fields(study),
        model_id=study.model_id,
        predictions=predictions,
        final_finding=study.final_finding,
        impression=study.impression,
        ai_agrees=(study.final_finding == ai_top) if study.final_finding and ai_top else None,
        has_heatmap=study.heatmap is not None,
        record=record,
    )


def audit_event(event: AuditEvent) -> AuditEventOut:
    return AuditEventOut(
        id=event.id,
        at=event.at,
        action=event.action,
        actor=user_summary(event.actor) if event.actor else None,
        target=user_summary(event.target_user) if event.target_user else None,
        study_id=event.study_id,
        detail=event.detail,
        tx_hash=event.tx_hash,
    )


def _summary_fields(study: Study) -> dict[str, object]:
    analysis = ANALYSIS_TYPES[study.analysis_type]
    top = study.final_finding or (str(study.predictions[0]["label"]) if study.predictions else None)
    return {
        "id": study.id,
        "status": study.status,
        "analysis_type": study.analysis_type,
        "analysis_name": analysis.name,
        "modality": analysis.modality,
        "patient": user_summary(study.patient),
        "clinician": user_summary(study.clinician),
        "top_finding": top,
        "created_at": study.created_at,
        "published_at": study.published_at,
    }
