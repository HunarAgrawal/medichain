"""Request and response models for the HTTP API (snake_case on the wire)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.auth import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.ml.catalog import AnalysisTypeId
from app.models import Role, StudyStatus

Name = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f<>]+$"
    ),
]
Password = Annotated[
    str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
]
FileKind = Literal["scan", "report", "heatmap"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


# Accounts


class UserSummary(_Model):
    id: str
    name: str
    role: Role
    title: str | None
    reference: str


class UserOut(UserSummary):
    email: str
    date_of_birth: date | None
    wallet_address: str | None
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class LoginRequest(_Model):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=PASSWORD_MAX_LENGTH)]


class PasswordChange(_Model):
    current_password: Annotated[
        str, StringConstraints(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    ]
    new_password: Password


# Public metadata


class AnalysisTypeInfo(_Model):
    id: AnalysisTypeId
    name: str
    modality: str
    description: str
    labels: list[str]


class DemoAccount(_Model):
    role: Role
    name: str
    email: str
    password: str
    description: str


class ChainInfo(_Model):
    chain_id: int
    contract_address: str
    explorer_url: str | None


class MetaResponse(_Model):
    analysis_types: list[AnalysisTypeInfo]
    max_upload_mb: int
    chain: ChainInfo
    demo_accounts: list[DemoAccount] | None


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


class StudySummary(_Model):
    id: str
    status: StudyStatus
    analysis_type: AnalysisTypeId
    analysis_name: str
    modality: str
    patient: UserSummary
    clinician: UserSummary
    top_finding: str | None
    created_at: datetime
    published_at: datetime | None


class StudyDetail(StudySummary):
    model_id: str
    predictions: list[PredictionOut]
    final_finding: str | None
    impression: str | None
    ai_agrees: bool | None
    has_heatmap: bool
    record: RecordInfo | None


class PublishRequest(_Model):
    final_finding: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
    ]
    impression: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)
    ]


class PatientOverview(_Model):
    patient: UserSummary
    date_of_birth: date | None
    shared_with_me: bool
    published_studies: int
    last_study_at: datetime | None


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
    role: Role
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    date_of_birth: date | None = None
    password: Password | None = None

    @field_validator("date_of_birth")
    @classmethod
    def _past(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class AdminUserCreated(_Model):
    user: UserOut
    temporary_password: str | None


class AdminUserUpdate(_Model):
    is_active: bool


class ServiceCheck(_Model):
    ok: bool
    detail: str


class AdminOverview(_Model):
    users: dict[str, int]
    studies: dict[str, int]
    services: dict[str, ServiceCheck]


# Verification


class Issuer(_Model):
    name: str
    title: str | None


class VerifyResponse(_Model):
    authentic: bool
    report_sha256: str
    record_id: str | None = None
    published_at: datetime | None = None
    issuer: Issuer | None = None
    analysis_name: str | None = None
    matches_expected_record: bool | None = None


Limit = Annotated[int, Field(ge=1, le=100)]
Offset = Annotated[int, Field(ge=0)]
