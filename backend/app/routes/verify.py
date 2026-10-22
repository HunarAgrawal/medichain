"""Public report verification: anyone holding a report PDF can check it against the chain."""

import hashlib
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from sqlalchemy import select

from app import audit
from app.audit import Action
from app.deps import DbDep, ServicesDep, client_ip, enforce_rate_limit
from app.imaging import read_upload
from app.ml.catalog import ANALYSIS_TYPES
from app.models import Study, User
from app.schemas import Issuer, VerifyResponse

router = APIRouter(prefix="/verify", tags=["verify"])

MAX_REPORT_BYTES = 20 * 1024 * 1024
RecordId = Annotated[str | None, Form(pattern=r"^0x[0-9a-fA-F]{64}$")]


@router.post("")
async def verify_report(
    request: Request,
    file: Annotated[UploadFile, File(description="The report PDF to check")],
    svc: ServicesDep,
    db: DbDep,
    record_id: RecordId = None,
) -> VerifyResponse:
    """Hash the uploaded file and look the hash up on-chain. Nothing is stored."""
    enforce_rate_limit(svc.limits.verify, client_ip(request))
    report_sha256 = hashlib.sha256(await read_upload(file, MAX_REPORT_BYTES)).hexdigest()
    expected = record_id.lower() if record_id else None
    found = await svc.registry.verify_report(report_sha256)
    if found is None:
        return VerifyResponse(
            authentic=False,
            report_sha256=report_sha256,
            matches_expected_record=False if expected else None,
        )

    study = await db.scalar(select(Study).where(Study.record_id == found.record_id))
    issuer = await db.scalar(select(User).where(User.wallet_address == found.issuer))
    audit.record(db, Action.REPORT_VERIFIED, study_id=study.id if study else None)
    await db.commit()
    return VerifyResponse(
        authentic=True,
        report_sha256=report_sha256,
        record_id=found.record_id,
        published_at=datetime.fromtimestamp(found.published_at, UTC),
        issuer=Issuer(name=issuer.name, title=issuer.title) if issuer else None,
        analysis_name=ANALYSIS_TYPES[study.analysis_type].name if study else None,
        matches_expected_record=(found.record_id == expected) if expected else None,
    )
