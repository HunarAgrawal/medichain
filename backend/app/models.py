"""ORM models. The chain is the source of truth for provenance and consent; these tables are
the application's working data and a fast read model."""

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

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


class Role(StrEnum):
    PATIENT = "patient"
    CLINICIAN = "clinician"
    ADMIN = "admin"


class StudyStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


def _enum(enum_type: type[StrEnum]) -> SqlEnum:
    return SqlEnum(
        enum_type, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(_enum(Role), index=True)
    title: Mapped[str | None] = mapped_column(String(100))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    password_hash: Mapped[str] = mapped_column(String(255))
    wallet_address: Mapped[str | None] = mapped_column(String(42), unique=True, index=True)
    wallet_key: Mapped[bytes | None] = mapped_column(LargeBinary)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    @property
    def reference(self) -> str:
        """Short, human-friendly identifier shown on reports instead of internal IDs."""
        return f"MC-{self.id.replace('-', '')[:8].upper()}"


class SessionToken(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())

    user: Mapped[User] = relationship(lazy="joined")


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    clinician_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    analysis_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[StudyStatus] = mapped_column(_enum(StudyStatus), index=True)
    model_id: Mapped[str] = mapped_column(String(200))
    predictions: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    final_finding: Mapped[str | None] = mapped_column(String(60))
    impression: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    # Sealed with the file key. The draft scan is cleared once it is pinned to IPFS.
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

    patient: Mapped[User] = relationship(foreign_keys=[patient_id], lazy="joined")
    clinician: Mapped[User] = relationship(foreign_keys=[clinician_id], lazy="joined")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
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
