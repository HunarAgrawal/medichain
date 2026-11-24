"""Request and response models for the HTTP API (snake_case on the wire)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.auth import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.ml.catalog import AnalysisTypeId
from app.models import OrgKind, Priority, Role, Sex, SiteKind, StudyStatus

_SAFE = r"^[^\x00-\x1f\x7f<>]+$"
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=_SAFE)
]
ShortText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=_SAFE)
]
OptionalText = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=200, pattern=r"^[^\x00-\x1f\x7f<>]*$")
]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 ()-]{7,20}$")]
# ABHA numbers are 14 digits, usually written 12-3456-7890-1234.
Abha = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\d{2}-?\d{4}-?\d{4}-?\d{4}$")
]
Password = Annotated[
    str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
]
FileKind = Literal["scan", "report", "heatmap"]
StaffRole = Literal["admin", "radiologist", "technician", "doctor"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


def _past(value: date | None) -> date | None:
    if value and value > date.today():
        raise ValueError("Date of birth cannot be in the future")
    return value


# Organizations and sites


class OrgSummary(_Model):
    id: str
    name: str
    short_name: str
    kind: OrgKind
    city: str | None


class OrgOut(OrgSummary):
    department: str
    address: str | None
    phone: str | None
    email: str | None
    accreditation: str | None
    uhid_prefix: str
    timezone: str


class OrgUpdate(_Model):
    name: ShortText | None = None
    short_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None
    ) = None
    kind: OrgKind | None = None
    department: ShortText | None = None
    address: OptionalText | None = None
    city: OptionalText | None = None
    phone: OptionalText | None = None
    email: EmailStr | None = None
    accreditation: OptionalText | None = None


class SiteOut(_Model):
    id: str
    name: str
    code: str
    kind: SiteKind
    city: str | None
    is_active: bool


class SiteCreate(_Model):
    name: ShortText
    code: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9-]{2,12}$")]
    kind: SiteKind
    city: OptionalText | None = None


# Accounts


class UserSummary(_Model):
    id: str
    name: str
    role: Role
    title: str | None
    reference: str


class UserOut(UserSummary):
    email: str | None
    phone: str | None
    qualification: str | None
    registration_number: str | None
    site: SiteOut | None
    wallet_address: str | None
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    organization: OrgSummary


class LoginRequest(_Model):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=PASSWORD_MAX_LENGTH)]


class PasswordChange(_Model):
    current_password: Annotated[
        str, StringConstraints(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    ]
    new_password: Password


# Patients


class PatientSummary(_Model):
    id: str
    name: str
    uhid: str
    sex: Sex | None
    age: int | None


class PatientOut(PatientSummary):
    date_of_birth: date | None
    phone: str | None
    abha_number: str | None
    email: str | None
    portal_access: bool
    created_at: datetime
    studies: int
    last_study_at: datetime | None


class PatientCreate(_Model):
    name: Name
    sex: Sex
    date_of_birth: date
    phone: Phone | None = None
    abha_number: Abha | None = None

    @field_validator("date_of_birth")
    @classmethod
    def _check_dob(cls, value: date) -> date | None:
        return _past(value)


class PortalRequest(_Model):
    email: EmailStr


class PortalEnabled(_Model):
    patient: PatientOut
    temporary_password: str


# Public metadata


class AnalysisTypeInfo(_Model):
    id: AnalysisTypeId
    name: str
    modality: str
    description: str
    labels: list[str]


class DemoPersona(_Model):
    role: Role
    name: str
    email: str
    title: str | None
    description: str


class DemoSample(_Model):
    file: str
    analysis_type: AnalysisTypeId
    label: str


class DemoSamples(_Model):
    attribution: str
    samples: list[DemoSample]


class DemoInfo(_Model):
    password: str
    workspace: OrgSummary | None
    personas: list[DemoPersona]


class ChainInfo(_Model):
    chain_id: int
    contract_address: str
    explorer_url: str | None


class MetaResponse(_Model):
    analysis_types: list[AnalysisTypeInfo]
    max_upload_mb: int
    tat_targets_minutes: dict[Priority, int]
    chain: ChainInfo
    demo: DemoInfo | None


# Studies


class PredictionOut(_Model):
    label: str
    score: float


class RecordInfo(_Model):
    record_id: str
    tx_hash: str
    scan_cid: str
    report_cid: str
    report_sha256: str
    scan_sha256: str


class SiteRef(_Model):
    id: str
    name: str
    code: str


class StudySummary(_Model):
    id: str
    accession: str
    status: StudyStatus
    priority: Priority
    analysis_type: AnalysisTypeId
    analysis_name: str
    modality: str
    patient: PatientSummary
    site: SiteRef
    referred_by: str | None
    radiologist: UserSummary | None
    top_finding: str | None  # empty unless the viewer may see clinical content
    critical: bool
    created_at: datetime
    published_at: datetime | None
    turnaround_minutes: int | None


class StudyDetail(StudySummary):
    access: Literal["full", "status"]
    indication: str | None
    created_by: UserSummary
    referrer: UserSummary | None
    model_id: str | None
    predictions: list[PredictionOut]
    final_finding: str | None
    findings: str | None
    impression: str | None
    ai_agrees: bool | None
    has_heatmap: bool
    record: RecordInfo | None


class PublishRequest(_Model):
    final_finding: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
    ]
    findings: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] | None = (
        None
    )
    impression: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)
    ]
    critical: bool = False


# Sharing


class ShareRequest(_Model):
    clinician_id: str


class CareTeamMember(_Model):
    clinician: UserSummary
    active: bool


# Audit and activity


class AuditEventOut(_Model):
    id: int
    at: datetime
    action: str
    actor: UserSummary | None
    target: UserSummary | None
    study_id: str | None
    detail: str | None
    tx_hash: str | None


# Administration


class AdminUserCreate(_Model):
    name: Name
    email: EmailStr
    role: StaffRole
    title: OptionalText | None = None
    qualification: OptionalText | None = None
    registration_number: OptionalText | None = None
    site_id: str | None = None
    phone: Phone | None = None
    password: Password | None = None


class AdminUserCreated(_Model):
    user: UserOut
    temporary_password: str | None


class AdminUserUpdate(_Model):
    is_active: bool


class ServiceCheck(_Model):
    ok: bool
    detail: str


class Kpis(_Model):
    studies_today: int
    reported_today: int
    awaiting_report: int
    stat_waiting: int
    median_tat_minutes: int | None
    within_target_pct: float | None
    ai_agreement_pct: float | None
    critical_findings: int
    studies_in_period: int


class DailyVolume(_Model):
    day: date
    by_modality: dict[str, int]
    reported: int


class PriorityTat(_Model):
    priority: Priority
    reported: int
    median_minutes: int | None
    target_minutes: int
    within_target_pct: float | None


class SiteLoad(_Model):
    site: SiteRef
    studies: int
    awaiting: int
    median_tat_minutes: int | None


class RadiologistLoad(_Model):
    radiologist: UserSummary
    reports: int
    median_tat_minutes: int | None


class Dashboard(_Model):
    period_days: int
    kpis: Kpis
    daily: list[DailyVolume]
    tat_by_priority: list[PriorityTat]
    sites: list[SiteLoad]
    radiologists: list[RadiologistLoad]
    staff: dict[str, int]
    patients: int
    services: dict[str, ServiceCheck]


# Verification


class Issuer(_Model):
    name: str
    title: str | None
    qualification: str | None
    registration_number: str | None
    organization: str | None


class VerifyResponse(_Model):
    authentic: bool
    report_sha256: str
    record_id: str | None = None
    published_at: datetime | None = None
    issuer: Issuer | None = None
    analysis_name: str | None = None
    accession: str | None = None
    matches_expected_record: bool | None = None


Limit = Annotated[int, Field(ge=1, le=200)]
Offset = Annotated[int, Field(ge=0)]
