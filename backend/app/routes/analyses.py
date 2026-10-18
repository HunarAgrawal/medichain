from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile, status

from app.deps import CurrentWallet, ServicesDep, enforce_rate_limit
from app.imaging import decode_scan, read_upload
from app.ml.catalog import AnalysisTypeId
from app.pipeline import run_analysis
from app.schemas import AnalysisForm, AnalysisResponse, PatientAge, PatientId, PatientName

router = APIRouter(prefix="/analyses", tags=["analyses"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_analysis(
    analysis_type: Annotated[AnalysisTypeId, Form()],
    patient_id: Annotated[PatientId, Form()],
    patient_name: Annotated[PatientName, Form()],
    patient_age: Annotated[PatientAge, Form()],
    file: Annotated[UploadFile, File(description="PNG or JPEG scan")],
    wallet: CurrentWallet,
    services: ServicesDep,
) -> AnalysisResponse:
    """Analyze a scan, render the PDF report, and pin both files to IPFS encrypted.

    The caller then anchors the returned CIDs on-chain with ``createRecord``.
    """
    enforce_rate_limit(services.limits.analysis, wallet)
    form = AnalysisForm(
        analysis_type=analysis_type,
        patient_id=patient_id,
        patient_name=patient_name,
        patient_age=patient_age,
    )
    data = await read_upload(file, services.settings.max_upload_bytes)
    return await run_analysis(services, form, decode_scan(data))
