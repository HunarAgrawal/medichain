from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from app.crypto import IntegrityError, seal, unseal
from app.ml.engine import Prediction
from app.report import ReportInput, render_report
from tests.conftest import CONTRACT_ADDRESS, make_settings

KEY = b"k" * 32


def test_seal_round_trip_and_binding() -> None:
    blob = seal(KEY, b"payload", kind="scan", patient_id="P-1")

    assert unseal(KEY, blob, kind="scan", patient_id="P-1") == b"payload"
    with pytest.raises(IntegrityError):
        unseal(KEY, blob, kind="report", patient_id="P-1")
    with pytest.raises(IntegrityError):
        unseal(KEY, blob, kind="scan", patient_id="P-2")
    with pytest.raises(IntegrityError):
        unseal(b"x" * 32, blob, kind="scan", patient_id="P-1")
    with pytest.raises(IntegrityError):
        unseal(KEY, blob[:10], kind="scan", patient_id="P-1")


def test_report_escapes_user_text() -> None:
    pdf = render_report(
        ReportInput(
            report_id="r-1",
            created_at=datetime.now(UTC),
            patient_id="P-1",
            patient_name="<b>Ann & Co</b> <font size=90>",
            patient_age=30,
            analysis_name="Pneumonia",
            modality="Chest X-ray",
            model_id="test/model",
            predictions=[Prediction("Pneumonia", 0.8), Prediction("Normal", 0.2)],
            scan=Image.new("RGB", (200, 120), "gray"),
            heatmap=Image.new("RGB", (200, 120), "red"),
            scan_sha256="0" * 64,
            record_url="http://localhost:5173/?record=P-1",
        )
    )
    assert pdf.startswith(b"%PDF")


@pytest.mark.parametrize(
    "overrides",
    [
        {"jwt_secret": "short"},
        {"encryption_key": "not base64!"},
        {"encryption_key": "c2hvcnQ="},
        {"contract_address": "0x123"},
        {"allowed_wallets": "0xnope"},
    ],
)
def test_invalid_settings_fail_fast(overrides: dict) -> None:
    with pytest.raises(ValidationError):
        make_settings(**overrides)


def test_settings_parse_comma_lists() -> None:
    settings = make_settings(
        cors_origins="http://a.test, http://b.test",
        allowed_wallets=CONTRACT_ADDRESS.lower(),
    )
    assert settings.cors_origins == ["http://a.test", "http://b.test"]
    assert settings.allowed_wallets == [CONTRACT_ADDRESS]


def test_meta_exposes_public_configuration(client: TestClient) -> None:
    body = client.get("/api/v1/meta").json()
    assert body["contract_address"] == CONTRACT_ADDRESS
    assert body["chain_id"] == 31337
    assert {t["id"] for t in body["analysis_types"]} == {"brain_tumor", "chest_xray"}


def test_responses_carry_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    preflight = {"Access-Control-Request-Method": "POST"}
    allowed = client.options(
        "/api/v1/analyses", headers={**preflight, "Origin": "http://localhost:5173"}
    )
    blocked = client.options(
        "/api/v1/analyses", headers={**preflight, "Origin": "http://evil.test"}
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers


def test_docs_can_be_disabled() -> None:
    from app.main import create_app

    app = create_app(make_settings(enable_docs=False))
    assert app.openapi_url is None
