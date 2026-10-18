from fastapi import APIRouter

from app.deps import ServicesDep
from app.ml.catalog import ANALYSIS_TYPES
from app.schemas import AnalysisTypeInfo, MetaResponse

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta")
def meta(services: ServicesDep) -> MetaResponse:
    """Public configuration the frontend needs: chain, contract and available analyses."""
    settings = services.settings
    return MetaResponse(
        chain_id=settings.chain_id,
        contract_address=settings.contract_address,
        max_upload_mb=settings.max_upload_mb,
        analysis_types=[
            AnalysisTypeInfo(id=t.id, name=t.name, modality=t.modality, description=t.description)
            for t in ANALYSIS_TYPES.values()
        ],
    )
