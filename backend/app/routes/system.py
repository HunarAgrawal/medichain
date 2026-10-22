from fastapi import APIRouter

from app.demo import DEMO_PASSWORD, DEMO_USERS
from app.deps import ServicesDep
from app.ml.catalog import ANALYSIS_TYPES
from app.schemas import AnalysisTypeInfo, ChainInfo, DemoAccount, MetaResponse

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta")
def meta(svc: ServicesDep) -> MetaResponse:
    """Public configuration the app needs before sign-in."""
    settings = svc.settings
    demo = (
        [
            DemoAccount(
                role=d.role,
                name=d.name,
                email=d.email,
                password=DEMO_PASSWORD,
                description=d.description,
            )
            for d in DEMO_USERS
        ]
        if settings.demo_mode
        else None
    )
    return MetaResponse(
        analysis_types=[
            AnalysisTypeInfo(
                id=t.id,
                name=t.name,
                modality=t.modality,
                description=t.description,
                labels=list(t.labels.values()),
            )
            for t in ANALYSIS_TYPES.values()
        ],
        max_upload_mb=settings.max_upload_mb,
        chain=ChainInfo(
            chain_id=settings.chain_id,
            contract_address=settings.contract_address,
            explorer_url=settings.explorer_url,
        ),
        demo_accounts=demo,
    )
