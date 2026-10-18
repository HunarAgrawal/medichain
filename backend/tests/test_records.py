from fastapi.testclient import TestClient

from app.crypto import seal
from app.services import Services
from tests.conftest import Wallet, png_bytes


def _store_record(services: Services, owner: str, patient_id: str = "P-001") -> bytes:
    key = services.settings.encryption_key_bytes
    scan = png_bytes()
    report = b"%PDF-1.7 report"
    scan_cid = services.storage.put(seal(key, scan, kind="scan", patient_id=patient_id))
    report_cid = services.storage.put(seal(key, report, kind="report", patient_id=patient_id))
    services.records.create(patient_id, owner, scan_cid, report_cid)
    return scan


def test_owner_can_read_report_and_scan(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    scan = _store_record(services, wallet.address)
    headers = wallet.sign_in(client)

    report = client.get("/api/v1/records/P-001/report", headers=headers)
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert report.headers["content-disposition"] == 'inline; filename="P-001-report.pdf"'
    assert report.headers["cache-control"] == "no-store"
    assert report.content == b"%PDF-1.7 report"

    image = client.get("/api/v1/records/P-001/scan", headers=headers)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.content == scan


def test_grantee_can_read_but_stranger_cannot(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    grantee, stranger = Wallet(), Wallet()
    _store_record(services, wallet.address)
    services.records.grantees["P-001"] = {grantee.address}

    url = "/api/v1/records/P-001/report"
    assert client.get(url, headers=grantee.sign_in(client)).status_code == 200
    denied = client.get(url, headers=stranger.sign_in(client))
    assert denied.status_code == 403
    assert denied.json() == {"detail": "You do not have access to this record."}


def test_missing_record_returns_404(client: TestClient, wallet: Wallet) -> None:
    response = client.get("/api/v1/records/P-404/report", headers=wallet.sign_in(client))
    assert response.status_code == 404


def test_tampered_blob_fails_integrity_check(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    _store_record(services, wallet.address)
    cid = services.records.records["P-001"].report_cid
    blob = bytearray(services.storage.blobs[cid])
    blob[-1] ^= 0x01
    services.storage.blobs[cid] = bytes(blob)

    response = client.get("/api/v1/records/P-001/report", headers=wallet.sign_in(client))
    assert response.status_code == 502


def test_blob_cannot_be_replayed_under_another_patient(
    client: TestClient, services: Services, wallet: Wallet
) -> None:
    _store_record(services, wallet.address, patient_id="P-001")
    original = services.records.records["P-001"]
    services.records.create("P-002", wallet.address, original.scan_cid, original.report_cid)

    response = client.get("/api/v1/records/P-002/report", headers=wallet.sign_in(client))
    assert response.status_code == 502


def test_patient_id_in_path_is_validated(client: TestClient, wallet: Wallet) -> None:
    response = client.get("/api/v1/records/bad%20id/report", headers=wallet.sign_in(client))
    assert response.status_code == 422
