"""Operational metrics for the management dashboard: volumes, turnaround times, AI agreement
and workload. Aggregates only; no patient appears in any of them."""

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.catalog import ANALYSIS_TYPES
from app.models import TAT_TARGET_MINUTES, Organization, Priority, Role, Study, StudyStatus, User
from app.presenters import user_summary
from app.schemas import DailyVolume, Kpis, PriorityTat, RadiologistLoad, SiteLoad, SiteRef


def _median(values: list[int]) -> int | None:
    return int(median(values)) if values else None


def _pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def _within_target(study: Study) -> bool:
    minutes = study.turnaround_minutes
    return minutes is not None and minutes <= TAT_TARGET_MINUTES[study.priority]


async def compute(
    db: AsyncSession, org: Organization, days: int, now: datetime | None = None
) -> tuple[Kpis, list[DailyVolume], list[PriorityTat], list[SiteLoad], list[RadiologistLoad]]:
    now = now or datetime.now(UTC)
    zone = ZoneInfo(org.timezone)
    today = now.astimezone(zone).date()
    period_start = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), zone)
    studies = list(
        (
            await db.scalars(
                select(Study).where(
                    Study.org_id == org.id,
                    or_(Study.created_at >= period_start, Study.status == StudyStatus.DRAFT),
                )
            )
        )
        .unique()
        .all()
    )
    in_period = [s for s in studies if s.created_at >= period_start]
    reported = [s for s in in_period if s.status is StudyStatus.PUBLISHED]
    drafts = [s for s in studies if s.status is StudyStatus.DRAFT]

    def local_day(value: datetime):
        return value.astimezone(zone).date()

    agreed = [
        s for s in reported if s.predictions and s.final_finding == str(s.predictions[0]["label"])
    ]
    kpis = Kpis(
        studies_today=sum(1 for s in in_period if local_day(s.created_at) == today),
        reported_today=sum(
            1 for s in reported if s.published_at and local_day(s.published_at) == today
        ),
        awaiting_report=len(drafts),
        stat_waiting=sum(1 for s in drafts if s.priority is Priority.STAT),
        median_tat_minutes=_median([s.turnaround_minutes or 0 for s in reported]),
        within_target_pct=_pct(sum(1 for s in reported if _within_target(s)), len(reported)),
        ai_agreement_pct=_pct(len(agreed), len(reported)),
        critical_findings=sum(1 for s in reported if s.critical),
        studies_in_period=len(in_period),
    )

    modalities = sorted({t.modality for t in ANALYSIS_TYPES.values()})
    acquired: defaultdict[object, Counter[str]] = defaultdict(Counter)
    signed: Counter[object] = Counter()
    for study in in_period:
        acquired[local_day(study.created_at)][ANALYSIS_TYPES[study.analysis_type].modality] += 1
    for study in reported:
        if study.published_at:
            signed[local_day(study.published_at)] += 1
    daily = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        daily.append(
            DailyVolume(
                day=day,
                by_modality={m: acquired[day][m] for m in modalities},
                reported=signed[day],
            )
        )

    tat = []
    for priority in (Priority.STAT, Priority.URGENT, Priority.ROUTINE):
        group = [s for s in reported if s.priority is priority]
        tat.append(
            PriorityTat(
                priority=priority,
                reported=len(group),
                median_minutes=_median([s.turnaround_minutes or 0 for s in group]),
                target_minutes=TAT_TARGET_MINUTES[priority],
                within_target_pct=_pct(sum(1 for s in group if _within_target(s)), len(group)),
            )
        )

    by_site: defaultdict[str, list[Study]] = defaultdict(list)
    for study in studies:  # everything in the period, plus older drafts still waiting
        by_site[study.site_id].append(study)
    reported_ids = {s.id for s in reported}
    sites = sorted(
        (
            SiteLoad(
                site=SiteRef(id=group[0].site.id, name=group[0].site.name, code=group[0].site.code),
                studies=sum(1 for s in group if s.created_at >= period_start),
                awaiting=sum(1 for s in group if s.status is StudyStatus.DRAFT),
                median_tat_minutes=_median(
                    [s.turnaround_minutes or 0 for s in group if s.id in reported_ids]
                ),
            )
            for group in by_site.values()
        ),
        key=lambda load: -load.studies,
    )

    by_radiologist: defaultdict[str, list[Study]] = defaultdict(list)
    for study in reported:
        if study.radiologist_id:
            by_radiologist[study.radiologist_id].append(study)
    radiologists = sorted(
        (
            RadiologistLoad(
                radiologist=user_summary(group[0].radiologist),
                reports=len(group),
                median_tat_minutes=_median([s.turnaround_minutes or 0 for s in group]),
            )
            for group in by_radiologist.values()
            if group[0].radiologist
        ),
        key=lambda load: -load.reports,
    )
    return kpis, daily, tat, sites, radiologists


async def headcount(db: AsyncSession, org_id: str) -> tuple[dict[str, int], int]:
    rows = dict(
        (
            await db.execute(
                select(User.role, func.count())
                .where(User.org_id == org_id, User.is_active.is_(True))
                .group_by(User.role)
            )
        ).all()
    )
    staff = {role.value: rows.get(role, 0) for role in Role if role is not Role.PATIENT}
    return staff, rows.get(Role.PATIENT, 0)
