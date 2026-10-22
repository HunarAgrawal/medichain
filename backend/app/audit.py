"""Append-only audit trail of security-relevant actions. Details never contain health data."""

from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, User


class Action(StrEnum):
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    PASSWORD_CHANGED = "password_changed"  # noqa: S105 (an event name, not a secret)
    STUDY_CREATED = "study_created"
    STUDY_DISCARDED = "study_discarded"
    STUDY_PUBLISHED = "study_published"
    FILE_VIEWED = "file_viewed"
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"
    USER_CREATED = "user_created"
    USER_DEACTIVATED = "user_deactivated"
    USER_REACTIVATED = "user_reactivated"
    REPORT_VERIFIED = "report_verified"


def record(
    db: AsyncSession,
    action: Action,
    *,
    actor: User | None = None,
    study_id: str | None = None,
    target: User | None = None,
    detail: str | None = None,
    tx_hash: str | None = None,
) -> None:
    db.add(
        AuditEvent(
            action=action.value,
            actor_id=actor.id if actor else None,
            study_id=study_id,
            target_user_id=target.id if target else None,
            detail=detail,
            tx_hash=tx_hash,
        )
    )
