"""Append-only audit trail of security-relevant actions. Details never contain health data."""

from datetime import datetime
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, User


class Action(StrEnum):
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    PASSWORD_CHANGED = "password_changed"  # noqa: S105 (an event name, not a secret)
    PATIENT_REGISTERED = "patient_registered"
    PORTAL_ENABLED = "portal_enabled"
    STUDY_CREATED = "study_created"
    STUDY_DISCARDED = "study_discarded"
    STUDY_PUBLISHED = "study_published"
    CRITICAL_FINDING = "critical_finding"
    FILE_VIEWED = "file_viewed"
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"
    USER_CREATED = "user_created"
    USER_DEACTIVATED = "user_deactivated"
    USER_REACTIVATED = "user_reactivated"
    SETTINGS_UPDATED = "settings_updated"
    SITE_CREATED = "site_created"
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
    org_id: str | None = None,
    at: datetime | None = None,
) -> None:
    org = org_id or (actor.org_id if actor else None) or (target.org_id if target else None)
    event = AuditEvent(
        org_id=org,
        action=action.value,
        actor_id=actor.id if actor else None,
        study_id=study_id,
        target_user_id=target.id if target else None,
        detail=detail,
        tx_hash=tx_hash,
    )
    if at is not None:
        event.at = at
    db.add(event)
