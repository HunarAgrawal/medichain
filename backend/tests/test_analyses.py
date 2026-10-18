import hashlib

import pytest
from fastapi.testclient import TestClient

from app.crypto import unseal
from app.main import create_app
from app.services import Services
from tests.conftest import Wallet, make_settings, png_bytes

URL = "/api/v1/analyses"
FORM = {
    "analysis_type": "brain_tumor",
    "patient_id": "P-001",
    "patient_name": "Jane Doe",
    "patient_age": "42",
}


def _post(client: TestClient, headers: dict, data: dict | None = None, file: bytes | None = None):
    payload = file if file is not None else png_bytes()
    return client.post(
        URL, data=data or FORM, files={"file": ("scan.png", payload, "image/png")}, headers=headers
    )


def test_analysis_returns_predictions_and_pins_encrypted_files(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    scan = png_bytes()
    response = _post(client, wallet.sign_in(client), file=scan)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["analysis_type"] == "brain_tumor"
    assert body["predictions"][0] == {"label": "Glioma", "score": 0.91}
    assert body["heatmap_png"]
    assert body["scan"]["sha256"] == hashlib.sha256(scan).hexdigest()

    key = services.settings.encryption_key_bytes
    stored_scan = services.storage.blobs[body["scan"]["cid"]]
    stored_report = services.storage.blobs[body["report"]["cid"]]
    assert scan not in stored_scan
    assert unseal(key, stored_scan, kind="scan", patient_id="P-001") == scan
    report = unseal(key, stored_report, kind="report", patient_id="P-001")
    assert report.startswith(b"%PDF")
    assert hashlib.sha256(report).hexdigest() == body["report"]["sha256"]


def test_analysis_requires_sign_in(client: TestClient) -> None:
    assert _post(client, headers={}).status_code == 401


def test_existing_patient_id_is_rejected_before_inference(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    services.records.create("P-001", wallet.address, "bafyscan", "bafyreport")

    response = _post(client, wallet.sign_in(client))
    assert response.status_code == 409
    assert services.engine.calls == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("analysis_type", "knee_mri"),
        ("patient_id", "../etc"),
        ("patient_id", "x" * 65),
        ("patient_name", ""),
        ("patient_name", "line\nbreak"),
        ("patient_age", "131"),
        ("patient_age", "-1"),
    ],
)
def test_invalid_form_fields_are_rejected(
    client: TestClient, wallet: Wallet, field: str, value: str
) -> None:
    response = _post(client, wallet.sign_in(client), data={**FORM, field: value})
    assert response.status_code == 422


def test_non_image_upload_is_rejected(client: TestClient, wallet: Wallet) -> None:
    response = _post(client, wallet.sign_in(client), file=b"%PDF-1.7 not an image")
    assert response.status_code == 415


def test_tiny_image_is_rejected(client: TestClient, wallet: Wallet) -> None:
    response = _post(client, wallet.sign_in(client), file=png_bytes(size=(32, 32)))
    assert response.status_code == 422


def test_oversized_upload_is_rejected(services: Services, wallet: Wallet) -> None:
    services.settings = make_settings(max_upload_mb=1)
    with TestClient(create_app(services=services)) as client:
        response = _post(client, wallet.sign_in(client), file=b"\x89PNG" + b"0" * (1024 * 1024))
    assert response.status_code == 413


def test_sixteen_bit_grayscale_png_is_accepted(client: TestClient, wallet: Wallet) -> None:
    response = _post(client, wallet.sign_in(client), file=png_bytes(mode="I;16"))
    assert response.status_code == 201, response.text
