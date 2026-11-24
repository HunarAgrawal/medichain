"""Convert ORM objects to API response models. Clinical content is only included when the viewer
has full access to a study; status views carry who, where and when, never what."""

from datetime import date

from app.catalog import STUDY_TYPES, Discipline
from app.models import AuditEvent, Organization, Site, Study, StudyStatus, User
from app.schemas import (
    AuditEventOut,
    LabResultOut,
    OrgOut,
    OrgSummary,
    PatientOut,
    PatientSummary,
    PredictionOut,
    RecordInfo,
    SiteOut,
    SiteRef,
    StudyDetail,
    StudySummary,
    UserOut,
    UserSummary,
)
from app.workflows import View


def age(dob: date | None, on: date | None = None) -> int | None:
    if dob is None:
        return None
    today = on or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def user_summary(user: User) -> UserSummary:
    return UserSummary.model_validate(user)


def org_summary(org: Organization) -> OrgSummary:
    return OrgSummary.model_validate(org)


def org_out(org: Organization) -> OrgOut:
    return OrgOut.model_validate(org)


def site_out(site: Site) -> SiteOut:
    return SiteOut.model_validate(site)


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        role=user.role,
        title=user.title,
        reference=user.reference,
        email=user.email,
        phone=user.phone,
        qualification=user.qualification,
        registration_number=user.registration_number,
        site=site_out(user.site) if user.site else None,
        wallet_address=user.wallet_address,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        organization=org_summary(user.organization),
    )


def patient_summary(patient: User) -> PatientSummary:
    return PatientSummary(
        id=patient.id,
        name=patient.name,
        uhid=patient.reference,
        sex=patient.sex,
        age=age(patient.date_of_birth),
    )


def patient_out(patient: User, studies: int = 0, last_study_at=None) -> PatientOut:
    return PatientOut(
        **patient_summary(patient).model_dump(),
        date_of_birth=patient.date_of_birth,
        phone=patient.phone,
        abha_number=patient.abha_number,
        email=patient.email,
        portal_access=patient.portal_access,
        created_at=patient.created_at,
        studies=studies,
        last_study_at=last_study_at,
    )


def study_summary(study: Study, view: View) -> StudySummary:
    return StudySummary(**_summary_fields(study, view))


def study_detail(study: Study, view: View) -> StudyDetail:
    full = view is View.FULL
    predictions = (
        [PredictionOut(label=str(p["label"]), score=float(p["score"])) for p in study.predictions]
        if full
        else []
    )
    ai_top = predictions[0].label if predictions else None
    record = None
    if full and study.status is StudyStatus.PUBLISHED and study.record_id:
        record = RecordInfo(
            record_id=study.record_id,
            tx_hash=study.tx_hash or "",
            scan_cid=study.scan_cid or "",
            report_cid=study.report_cid or "",
            report_sha256=study.report_sha256 or "",
            scan_sha256=study.scan_sha256,
        )
    return StudyDetail(
        **_summary_fields(study, view),
        access=view.value,
        indication=study.indication,
        created_by=user_summary(study.created_by),
        referrer=user_summary(study.referrer) if study.referrer else None,
        model_id=study.model_id if full else None,
        predictions=predictions,
        final_finding=study.final_finding if full else None,
        findings=study.findings if full else None,
        impression=study.impression if full else None,
        # Lab suggestions come from reference intervals, so there is no AI to agree with.
        ai_agrees=(study.final_finding == ai_top)
        if full and study.final_finding and ai_top and study.discipline is Discipline.RADIOLOGY
        else None,
        has_heatmap=full and study.heatmap is not None,
        results=[LabResultOut.model_validate(r) for r in study.results or []] if full else [],
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


def _summary_fields(study: Study, view: View) -> dict[str, object]:
    analysis = STUDY_TYPES[study.analysis_type]
    top = None
    if view is View.FULL:
        top = study.final_finding or (
            str(study.predictions[0]["label"]) if study.predictions else None
        )
    return {
        "id": study.id,
        "accession": study.accession,
        "status": study.status,
        "priority": study.priority,
        "analysis_type": study.analysis_type,
        "discipline": study.discipline,
        "analysis_name": analysis.name,
        "modality": analysis.modality,
        "patient": patient_summary(study.patient),
        "site": SiteRef(id=study.site.id, name=study.site.name, code=study.site.code),
        "referred_by": study.referrer.name if study.referrer else study.referrer_name,
        "reporter": user_summary(study.reporter) if study.reporter else None,
        "top_finding": top,
        # Being critical is clinical content too, so status views never see it.
        "critical": study.critical and view is View.FULL,
        "created_at": study.created_at,
        "published_at": study.published_at,
        "turnaround_minutes": study.turnaround_minutes,
    }
