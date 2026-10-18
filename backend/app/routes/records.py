from typing import Annotated

from fastapi import APIRouter, Path, Response

from app.crypto import unseal
from app.deps import CurrentWallet, ServicesDep, enforce_rate_limit
from app.imaging import media_type_of
from app.schemas import PATIENT_ID_PATTERN, FileKind

router = APIRouter(prefix="/records", tags=["records"])

_EXTENSIONS = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}


@router.get(
    "/{patient_id}/{kind}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}, "image/png": {}, "image/jpeg": {}}}},
)
async def get_record_file(
    patient_id: Annotated[str, Path(pattern=PATIENT_ID_PATTERN)],
    kind: FileKind,
    wallet: CurrentWallet,
    services: ServicesDep,
) -> Response:
    """Decrypt and return a record's scan or report. The contract decides who may read it."""
    enforce_rate_limit(services.limits.file_read, wallet)
    record = await services.records.get_record(patient_id, caller=wallet)
    cid = record.scan_cid if kind == "scan" else record.report_cid
    blob = await services.storage.cat(cid)
    content = unseal(services.settings.encryption_key_bytes, blob, kind=kind, patient_id=patient_id)
    media_type = "application/pdf" if kind == "report" else media_type_of(content)
    filename = f"{patient_id}-{kind}.{_EXTENSIONS.get(media_type, 'bin')}"
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
