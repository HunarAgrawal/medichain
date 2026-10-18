"""Request and response models for the HTTP API."""

from datetime import datetime
from typing import Annotated, Literal

from eth_utils import is_address, to_checksum_address
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.ml.catalog import AnalysisTypeId

PATIENT_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"

FileKind = Literal["scan", "report"]
PatientId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=PATIENT_ID_PATTERN)]
PatientName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f]+$"
    ),
]
PatientAge = Annotated[int, Field(ge=0, le=130)]


def _checksum_address(value: str) -> str:
    if not is_address(value):
        raise ValueError("Not a valid Ethereum address")
    return to_checksum_address(value)


Address = Annotated[str, AfterValidator(_checksum_address)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AnalysisTypeInfo(_Model):
    id: AnalysisTypeId
    name: str
    modality: str
    description: str


class MetaResponse(_Model):
    chain_id: int
    contract_address: str
    max_upload_mb: int
    analysis_types: list[AnalysisTypeInfo]


class ChallengeRequest(_Model):
    address: Address


class ChallengeResponse(_Model):
    nonce: str
    message: str
    expires_at: datetime


class VerifyRequest(_Model):
    nonce: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")]
    signature: Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{130}$")]


class SessionResponse(_Model):
    token: str
    address: str
    expires_at: datetime


class AnalysisForm(_Model):
    analysis_type: AnalysisTypeId
    patient_id: PatientId
    patient_name: PatientName
    patient_age: PatientAge


class PredictionOut(_Model):
    label: str
    score: float


class StoredFile(_Model):
    cid: str
    sha256: str


class AnalysisResponse(_Model):
    report_id: str
    created_at: datetime
    analysis_type: AnalysisTypeId
    model_id: str
    predictions: list[PredictionOut]
    heatmap_png: str | None = Field(description="Base64-encoded PNG overlay, if available.")
    scan: StoredFile
    report: StoredFile
