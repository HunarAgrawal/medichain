"""The analysis pipeline: classify, explain, report, encrypt, pin."""

import asyncio
import base64
import hashlib
import io
import uuid
from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import HTTPException, status
from PIL import Image
from starlette.concurrency import run_in_threadpool

from app.crypto import seal
from app.imaging import Scan
from app.ml.catalog import ANALYSIS_TYPES
from app.report import ReportInput, render_report
from app.schemas import AnalysisForm, AnalysisResponse, PredictionOut, StoredFile
from app.services import Services

HEATMAP_PREVIEW_PX = 512


async def run_analysis(services: Services, form: AnalysisForm, scan: Scan) -> AnalysisResponse:
    if await services.records.record_exists(form.patient_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A record with this patient ID already exists. Use a different ID.",
        )

    inference = await run_in_threadpool(services.engine.predict, form.analysis_type, scan.image)
    analysis = ANALYSIS_TYPES[form.analysis_type]
    report_id = str(uuid.uuid4())
    created_at = datetime.now(UTC)
    scan_sha256 = hashlib.sha256(scan.data).hexdigest()
    app_url = services.settings.public_app_url.rstrip("/")

    pdf = await run_in_threadpool(
        render_report,
        ReportInput(
            report_id=report_id,
            created_at=created_at,
            patient_id=form.patient_id,
            patient_name=form.patient_name,
            patient_age=form.patient_age,
            analysis_name=analysis.name,
            modality=analysis.modality,
            model_id=inference.model_id,
            predictions=inference.predictions,
            scan=scan.image,
            heatmap=inference.heatmap,
            scan_sha256=scan_sha256,
            record_url=f"{app_url}/?record={quote(form.patient_id)}",
        ),
    )

    key = services.settings.encryption_key_bytes
    scan_cid, report_cid = await asyncio.gather(
        services.storage.add(
            seal(key, scan.data, kind="scan", patient_id=form.patient_id),
            f"medichain-scan-{report_id}.bin",
        ),
        services.storage.add(
            seal(key, pdf, kind="report", patient_id=form.patient_id),
            f"medichain-report-{report_id}.bin",
        ),
    )

    return AnalysisResponse(
        report_id=report_id,
        created_at=created_at,
        analysis_type=form.analysis_type,
        model_id=inference.model_id,
        predictions=[PredictionOut(label=p.label, score=p.score) for p in inference.predictions],
        heatmap_png=_png_base64(inference.heatmap) if inference.heatmap else None,
        scan=StoredFile(cid=scan_cid, sha256=scan_sha256),
        report=StoredFile(cid=report_cid, sha256=hashlib.sha256(pdf).hexdigest()),
    )


def _png_base64(image: Image.Image) -> str:
    preview = image.copy()
    preview.thumbnail((HEATMAP_PREVIEW_PX, HEATMAP_PREVIEW_PX))
    buffer = io.BytesIO()
    preview.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")
