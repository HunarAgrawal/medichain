"""ORM models. The chain is the source of truth for provenance and consent; these tables are
the application's working data and a fast read model.

Every clinical row belongs to one organization (the tenant): a hospital, an imaging centre or a
teleradiology provider. Queries are always scoped to the signed-in user's organization.
"""

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.catalog import Discipline
from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Store UTC; always return timezone-aware values (SQLite drops tzinfo otherwise)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: object) -> datetime | None:
        return value.astimezone(UTC) if value is not None and value.tzinfo else value

    def process_result_value(self, value: datetime | None, dialect: object) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


class OrgKind(StrEnum):
    HOSPITAL = "hospital"
    IMAGING_CENTRE = "imaging_centre"
    TELERADIOLOGY = "teleradiology"


class SiteKind(StrEnum):
    RADIOLOGY_DEPARTMENT = "radiology_department"
    IMAGING_CENTRE = "imaging_centre"
    PARTNER = "partner"  # a client site whose studies are reported remotely


class Role(StrEnum):
    ADMIN = "admin"
    RADIOLOGIST = "radiologist"
    PATHOLOGIST = "pathologist"
    TECHNICIAN = "technician"  # radiographers and lab technologists
    DOCTOR = "doctor"  # a referring clinician
    PATIENT = "patient"


# Roles that hold a platform-managed wallet, and of those, the ones verified on the registry.
WALLET_ROLES = frozenset({Role.RADIOLOGIST, Role.PATHOLOGIST, Role.DOCTOR, Role.PATIENT})
CLINICIAN_ROLES = frozenset({Role.RADIOLOGIST, Role.PATHOLOGIST, Role.DOCTOR})
# The discipline each reporting role signs for.
REPORTING_DISCIPLINE = {
    Role.RADIOLOGIST: Discipline.RADIOLOGY,
    Role.PATHOLOGIST: Discipline.LABORATORY,
}


class Sex(StrEnum):
    FEMALE = "F"
    MALE = "M"
    OTHER = "O"


class Priority(StrEnum):
    ROUTINE = "routine"
    URGENT = "urgent"
    STAT = "stat"


# Turnaround targets from acquisition to signed report, used by the worklist and dashboard.
TAT_TARGET_MINUTES = {Priority.STAT: 60, Priority.URGENT: 4 * 60, Priority.ROUTINE: 24 * 60}


class StudyStatus(StrEnum):
    DRAFT = "draft"  # analysed or flagged, awaiting the signed report
    PUBLISHED = "published"  # signed, anchored on-chain and delivered


def _enum(enum_type: type[StrEnum]) -> SqlEnum:
    return SqlEnum(
        enum_type, native_enum=False, length=24, values_callable=lambda e: [m.value for m in e]
    )


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    short_name: Mapped[str] = mapped_column(String(40))
    kind: Mapped[OrgKind] = mapped_column(_enum(OrgKind))
    department: Mapped[str] = mapped_column(String(80), default="Department of Radiology")
    address: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    accreditation: Mapped[str | None] = mapped_column(String(120))
    uhid_prefix: Mapped[str] = mapped_column(String(8))
    timezone: Mapped[str] = mapped_column(String(40), default="Asia/Kolkata")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (UniqueConstraint("org_id", "code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(12))
    kind: Mapped[SiteKind] = mapped_column(_enum(SiteKind))
    city: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base):
    """Staff accounts and patients. A patient is registered by staff and may or may not have
    portal access; a patient without it has no email or usable password."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("org_id", "uhid"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(_enum(Role), index=True)
    title: Mapped[str | None] = mapped_column(String(100))  # designation or specialty
    qualification: Mapped[str | None] = mapped_column(String(100))
    registration_number: Mapped[str | None] = mapped_column(String(60))  # medical council number
    site_id: Mapped[str | None] = mapped_column(ForeignKey("sites.id"))
    phone: Mapped[str | None] = mapped_column(String(20))
    # Patients
    uhid: Mapped[str | None] = mapped_column(String(24), index=True)
    sex: Mapped[Sex | None] = mapped_column(_enum(Sex))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    abha_number: Mapped[str | None] = mapped_column(String(17))
    # Credentials and wallet
    password_hash: Mapped[str | None] = mapped_column(String(255))
    wallet_address: Mapped[str | None] = mapped_column(String(42), unique=True, index=True)
    wallet_key: Mapped[bytes | None] = mapped_column(LargeBinary)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    organization: Mapped[Organization] = relationship(lazy="joined")
    site: Mapped[Site | None] = relationship(lazy="joined")

    @property
    def reference(self) -> str:
        """Short, human-friendly identifier: the UHID for patients, a staff code otherwise."""
        return self.uhid or f"MC-{self.id.replace('-', '')[:8].upper()}"

    @property
    def portal_access(self) -> bool:
        return self.email is not None and self.password_hash is not None


class SessionToken(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())

    user: Mapped[User] = relationship(lazy="joined")


class Study(Base):
    """One diagnostic study: an imaging scan pre-read by AI, or a laboratory panel flagged
    against reference intervals. A radiologist or pathologist reports it; the signed report is
    anchored on-chain and delivered to the patient and the referring doctor.

    The sealed "scan" is the study's source data: the image, or the lab values as JSON."""

    __tablename__ = "studies"
    __table_args__ = (UniqueConstraint("org_id", "accession"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), index=True)
    accession: Mapped[str] = mapped_column(String(24))
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reporter_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    referrer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    referrer_name: Mapped[str | None] = mapped_column(String(100))  # an outside doctor
    analysis_type: Mapped[str] = mapped_column(String(32))
    discipline: Mapped[Discipline] = mapped_column(_enum(Discipline), index=True)
    priority: Mapped[Priority] = mapped_column(_enum(Priority), index=True)
    indication: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[StudyStatus] = mapped_column(_enum(StudyStatus), index=True)
    model_id: Mapped[str] = mapped_column(String(200))
    predictions: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    results: Mapped[list[dict[str, object]] | None] = mapped_column(JSON)  # laboratory values
    final_finding: Mapped[str | None] = mapped_column(String(60))
    findings: Mapped[str | None] = mapped_column(Text)
    impression: Mapped[str | None] = mapped_column(Text)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), index=True)

    # Sealed with the file key. The draft scan is cleared once it is stored.
    scan_media_type: Mapped[str] = mapped_column(String(32))
    scan_sha256: Mapped[str] = mapped_column(String(64))
    draft_scan: Mapped[bytes | None] = mapped_column(LargeBinary)
    heatmap: Mapped[bytes | None] = mapped_column(LargeBinary)

    # Set when published (mirrors the on-chain record).
    record_id: Mapped[str | None] = mapped_column(String(66), unique=True)
    scan_cid: Mapped[str | None] = mapped_column(String(128))
    report_cid: Mapped[str | None] = mapped_column(String(128))
    report_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66))

    site: Mapped[Site] = relationship(lazy="joined")
    patient: Mapped[User] = relationship(foreign_keys=[patient_id], lazy="joined")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="joined")
    reporter: Mapped[User | None] = relationship(foreign_keys=[reporter_id], lazy="joined")
    referrer: Mapped[User | None] = relationship(foreign_keys=[referrer_id], lazy="joined")

    @property
    def turnaround_minutes(self) -> int | None:
        if self.published_at is None:
            return None
        return int((self.published_at - self.created_at).total_seconds() // 60)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), index=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    study_id: Mapped[str | None] = mapped_column(
        ForeignKey("studies.id", ondelete="SET NULL"), index=True
    )
    target_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    detail: Mapped[str | None] = mapped_column(String(200))
    tx_hash: Mapped[str | None] = mapped_column(String(66))

    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id], lazy="joined")
    target_user: Mapped[User | None] = relationship(foreign_keys=[target_user_id], lazy="joined")
