from fastapi import APIRouter, Response
from sqlalchemy import select

from app import workflows
from app.catalog import STUDY_TYPES, Discipline
from app.demo import (
    DEMO_PASSWORD,
    DEMO_SAMPLES,
    DEMO_STAFF,
    PATIENT_PERSONA,
    PRIYA,
    SAMPLE_ATTRIBUTION,
    SAMPLES_DIR,
)
from app.deps import CurrentUser, DbDep, ServicesDep
from app.imaging import media_type_of
from app.labs import LAB_PANELS
from app.models import TAT_TARGET_MINUTES, Organization, Role
from app.presenters import org_summary
from app.schemas import (
    AnalyteInfo,
    ChainInfo,
    DemoInfo,
    DemoPersona,
    DemoSample,
    DemoSamples,
    MetaResponse,
    StudyTypeInfo,
)

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta")
async def meta(svc: ServicesDep, db: DbDep) -> MetaResponse:
    """Public configuration the app needs before sign-in."""
    settings = svc.settings
    demo = None
    if settings.demo_mode:
        workspace = await db.scalar(select(Organization).order_by(Organization.created_at))
        personas = [
            DemoPersona(
                role=s.role,
                label=s.label,
                name=s.name,
                email=s.email,
                title=s.title,
                description=s.persona,
            )
            for s in DEMO_STAFF
            if s.persona and s.label
        ]
        if PRIYA.portal_email:
            personas.insert(
                -1,
                DemoPersona(
                    role=Role.PATIENT,
                    label="Patient",
                    name=PRIYA.name,
                    email=PRIYA.portal_email,
                    title="Patient",
                    description=PATIENT_PERSONA,
                ),
            )
        demo = DemoInfo(
            password=DEMO_PASSWORD,
            workspace=org_summary(workspace) if workspace else None,
            personas=personas,
        )
    return MetaResponse(
        study_types=[_study_type(t.id) for t in STUDY_TYPES.values()],
        max_upload_mb=settings.max_upload_mb,
        tat_targets_minutes=TAT_TARGET_MINUTES,
        chain=ChainInfo(
            chain_id=settings.chain_id,
            contract_address=settings.contract_address,
            explorer_url=settings.explorer_url,
        ),
        demo=demo,
    )


def _study_type(type_id: str) -> StudyTypeInfo:
    t = STUDY_TYPES[type_id]
    panel = LAB_PANELS.get(t.id)
    return StudyTypeInfo(
        id=t.id,
        name=t.name,
        modality=t.modality,
        discipline=t.discipline,
        description=t.description,
        labels=list(t.labels),
        ai=t.discipline is Discipline.RADIOLOGY,
        analytes=[
            AnalyteInfo(
                code=a.code,
                name=a.name,
                unit=a.unit,
                kind=a.kind,
                reference=dict(a.reference),
                critical_low=a.critical_low,
                critical_high=a.critical_high,
                decimals=a.decimals,
                cutoff=a.cutoff,
            )
            for a in (panel.analytes if panel else ())
        ],
    )


# Demo mode only: bundled sample scans, so anyone trying the hosted demo has something to upload.


@router.get("/demo/samples")
def demo_samples(_: CurrentUser, svc: ServicesDep) -> DemoSamples:
    if not svc.settings.demo_mode:
        raise workflows.not_found("Page")
    return DemoSamples(
        attribution=SAMPLE_ATTRIBUTION,
        samples=[
            DemoSample(file=name, analysis_type=analysis, label=label)
            for name, analysis, label in DEMO_SAMPLES
        ],
    )


@router.get("/demo/samples/{name}", response_class=Response)
def demo_sample(name: str, _: CurrentUser, svc: ServicesDep) -> Response:
    allowed = {file for file, _, _ in DEMO_SAMPLES}
    if not svc.settings.demo_mode or name not in allowed:
        raise workflows.not_found("Sample")
    data = (SAMPLES_DIR / name).read_bytes()
    return Response(data, media_type=media_type_of(data))
