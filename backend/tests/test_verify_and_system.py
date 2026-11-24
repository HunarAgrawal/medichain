import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import HARDHAT_DEV_KEY
from app.main import create_app
from app.models import Role
from tests.conftest import CONTRACT_ADDRESS, CSRF, Env, build_services, make_settings


def _report_pdf(env: Env) -> tuple[bytes, dict]:
    radiologist = env.user(
        Role.RADIOLOGIST,
        "Dr. Ananya Rao",
        title="Consultant Radiologist",
        qualification="MD (Radiodiagnosis)",
        registration_number="UPMC-21458",
    )
    patient = env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    env.login(patient)
    return env.client.get(f"/api/v1/studies/{study['id']}/files/report").content, study


def test_a_published_report_verifies_without_signing_in(env: Env) -> None:
    pdf, study = _report_pdf(env)
    env.client.post("/api/v1/auth/logout")

    response = env.client.post(
        "/api/v1/verify",
        files={"file": ("report.pdf", pdf, "application/pdf")},
        data={"record_id": study["record"]["record_id"]},
    )
    body = response.json()
    assert body["authentic"] is True
    assert body["issuer"] == {
        "name": "Dr. Ananya Rao",
        "title": "Consultant Radiologist",
        "qualification": "MD (Radiodiagnosis)",
        "registration_number": "UPMC-21458",
        "organization": "Test Hospital 1",
    }
    assert body["analysis_name"] == "Brain tumor screening"
    assert body["accession"] == study["accession"]
    assert body["matches_expected_record"] is True


def test_altered_or_unknown_files_do_not_verify(env: Env) -> None:
    pdf, _ = _report_pdf(env)
    altered = pdf + b"\n% edited after signing"
    response = env.client.post(
        "/api/v1/verify",
        files={"file": ("report.pdf", altered, "application/pdf")},
        data={"record_id": "0x" + "ab" * 32},
    )
    assert response.json()["authentic"] is False
    assert response.json()["matches_expected_record"] is False


def test_verify_rejects_malformed_record_ids(env: Env) -> None:
    response = env.client.post(
        "/api/v1/verify",
        files={"file": ("x.pdf", b"%PDF", "application/pdf")},
        data={"record_id": "123"},
    )
    assert response.status_code == 422


def test_meta_lists_demo_personas_only_in_demo_mode(env: Env, tmp_path) -> None:
    env.organization()
    meta = env.client.get("/api/v1/meta").json()
    personas = meta["demo"]["personas"]
    assert [p["label"] for p in personas] == [
        "Radiographer",
        "Radiologist",
        "Teleradiologist",
        "Lab technologist",
        "Pathologist",
        "Referring doctor",
        "Patient",
        "Admin",
    ]
    assert personas[4]["role"] == "pathologist"
    assert meta["demo"]["workspace"]["name"] == "Test Hospital 1"
    assert meta["tat_targets_minutes"] == {"stat": 60, "urgent": 240, "routine": 1440}
    assert meta["chain"]["contract_address"] == CONTRACT_ADDRESS
    types = {t["id"]: t for t in meta["study_types"]}
    assert set(types) == {"brain_tumor", "chest_xray", "cbc", "drug_screen"}
    assert types["chest_xray"]["ai"] and types["chest_xray"]["discipline"] == "radiology"
    assert not types["cbc"]["ai"] and types["cbc"]["discipline"] == "laboratory"
    hb = types["cbc"]["analytes"][0]
    assert hb["code"] == "hb" and hb["reference"] == {"F": [12.0, 15.0], "M": [13.0, 17.0]}

    quiet = build_services(make_settings(tmp_path / "quiet", demo_mode=False))
    with TestClient(create_app(services=quiet)) as client:
        assert client.get("/api/v1/meta").json()["demo"] is None


def test_responses_carry_security_headers(env: Env) -> None:
    response = env.client.get("/api/v1/health")
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")


def test_cors_allows_only_the_configured_origin_with_credentials(env: Env) -> None:
    preflight = {"Access-Control-Request-Method": "POST", **CSRF}
    allowed = env.client.options(
        "/api/v1/auth/login", headers={**preflight, "Origin": "http://localhost:3000"}
    )
    blocked = env.client.options(
        "/api/v1/auth/login", headers={**preflight, "Origin": "http://evil.example"}
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "access-control-allow-origin" not in blocked.headers


@pytest.mark.parametrize(
    "overrides",
    [
        {"environment": "production", "demo_mode": True, "cookie_secure": True},
        {"environment": "production", "cookie_secure": False, "demo_mode": False},
        {"chain_id": 1},
        {"wallet_encryption_key": "a" * 43 + "="},
        {"encryption_key": "not base64!"},
        {"operator_private_key": "0x1234"},
        {"contract_address": "0x123"},
    ],
)
def test_unsafe_or_invalid_settings_fail_fast(tmp_path, overrides: dict) -> None:
    if "wallet_encryption_key" in overrides:
        overrides["encryption_key"] = overrides["wallet_encryption_key"]
    with pytest.raises(ValidationError):
        make_settings(tmp_path, **overrides)


def test_production_requires_a_real_operator_key(tmp_path) -> None:
    with pytest.raises(ValidationError, match="Hardhat"):
        make_settings(
            tmp_path,
            environment="production",
            demo_mode=False,
            cookie_secure=True,
            operator_private_key=HARDHAT_DEV_KEY,
        )


def test_the_api_can_serve_the_built_web_app(tmp_path) -> None:
    web = tmp_path / "web"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("<!doctype html><title>Medichain</title>")
    (web / "assets" / "app-1a2b.js").write_text("console.log('app')")
    (web / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("outside the web root")
    services = build_services(make_settings(tmp_path, static_dir=str(web)))

    with TestClient(create_app(services=services)) as client:
        for path in ("/", "/worklist", "/records/abc"):
            page = client.get(path)
            assert page.status_code == 200 and "<title>Medichain</title>" in page.text
            assert "default-src 'self'" in page.headers["content-security-policy"]
        asset = client.get("/assets/app-1a2b.js")
        assert "immutable" in asset.headers["cache-control"]
        assert client.get("/favicon.svg").text == "<svg/>"
        assert "outside" not in client.get("/../secret.txt").text
        assert client.get("/api/v1/health").json() == {"status": "ok"}
        assert client.get("/api/v1/nope").status_code == 404


def test_demo_sample_scans_are_served_to_signed_in_users_only(env: Env, tmp_path) -> None:
    assert env.client.get("/api/v1/demo/samples").status_code == 401
    env.login(env.user(Role.TECHNICIAN))
    listing = env.client.get("/api/v1/demo/samples").json()
    first = listing["samples"][0]
    assert "CC BY 4.0" in listing["attribution"]
    image = env.client.get(f"/api/v1/demo/samples/{first['file']}")
    assert image.status_code == 200 and image.headers["content-type"].startswith("image/")
    assert env.client.get("/api/v1/demo/samples/..%2F.env").status_code == 404
    assert env.client.get("/api/v1/demo/samples/README.md").status_code == 404
