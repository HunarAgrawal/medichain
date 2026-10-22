import hashlib

from sqlalchemy import select

from app.crypto import unseal
from app.models import AuditEvent, Role, Study
from tests.conftest import Env, png_bytes


def _get_study(env: Env, study_id: str) -> Study:
    async def load() -> Study:
        async with env.services.db() as db:
            study = await db.get(Study, study_id)
            assert study is not None
            return study

    return env.run(load)


def test_clinician_creates_a_draft_with_ai_findings(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT, "Asha Verma")
    study = env.draft(clinician, patient)

    assert study["status"] == "draft"
    assert study["patient"]["name"] == "Asha Verma"
    assert study["predictions"][0] == {"label": "Glioma", "score": 0.91}
    assert study["has_heatmap"] is True
    assert study["record"] is None
    assert study["created_at"].endswith(("+00:00", "Z")), "timestamps must carry their timezone"

    stored = _get_study(env, study["id"])
    assert png_bytes() not in stored.draft_scan
    key = env.services.settings.encryption_key_bytes
    assert unseal(key, stored.draft_scan, kind="scan", subject=stored.id) == png_bytes()


def test_only_clinicians_can_create_studies(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    for actor in (patient, env.user(Role.ADMIN)):
        env.login(actor)
        response = env.client.post(
            "/api/v1/studies",
            data={"patient_id": patient.id, "analysis_type": "brain_tumor"},
            files={"file": ("scan.png", png_bytes(), "image/png")},
        )
        assert response.status_code == 403


def test_study_requires_an_active_patient_and_a_valid_image(env: Env) -> None:
    clinician = env.user(Role.CLINICIAN)
    other_clinician = env.user(Role.CLINICIAN)
    patient = env.user(Role.PATIENT)
    env.login(clinician)

    def create(patient_id: str, payload: bytes) -> int:
        return env.client.post(
            "/api/v1/studies",
            data={"patient_id": patient_id, "analysis_type": "chest_xray"},
            files={"file": ("scan.png", payload, "image/png")},
        ).status_code

    assert create(other_clinician.id, png_bytes()) == 404
    assert create("missing", png_bytes()) == 404
    assert create(patient.id, b"%PDF-1.7 not an image") == 415
    assert create(patient.id, png_bytes(size=(32, 32))) == 422


def test_drafts_are_private_to_their_clinician(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.draft(clinician, patient)

    for outsider in (env.user(Role.CLINICIAN), patient):
        env.login(outsider)
        assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 404
        assert env.client.get("/api/v1/studies").json() == []


def test_publishing_anchors_an_encrypted_report_on_chain(env: Env) -> None:
    clinician = env.user(Role.CLINICIAN, "Dr. Rao", title="Radiologist")
    patient = env.user(Role.PATIENT)
    study = env.published(clinician, patient)

    record = study["record"]
    assert study["status"] == "published"
    assert study["final_finding"] == "Glioma" and study["ai_agrees"] is True
    on_chain = env.registry.records[record["record_id"]]
    assert on_chain.patient == patient.wallet_address
    assert on_chain.issuer == clinician.wallet_address
    assert on_chain.report_hash == record["report_sha256"]

    report_blob = env.storage.blobs[record["report_cid"]]
    assert b"%PDF" not in report_blob
    key = env.services.settings.encryption_key_bytes
    report = unseal(key, report_blob, kind="report", subject=study["id"])
    assert hashlib.sha256(report).hexdigest() == record["report_sha256"]
    assert _get_study(env, study["id"]).draft_scan is None


def test_a_study_publishes_once(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    again = env.client.post(
        f"/api/v1/studies/{study['id']}/publish",
        json={"final_finding": "Glioma", "impression": "Second attempt at publishing."},
    )
    assert again.status_code == 409


def test_unverified_clinicians_cannot_publish(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.draft(clinician, patient)
    env.registry.clinicians.discard(clinician.wallet_address)

    response = env.client.post(
        f"/api/v1/studies/{study['id']}/publish",
        json={"final_finding": "Glioma", "impression": "Enhancing left frontal mass."},
    )
    assert response.status_code == 403
    assert _get_study(env, study["id"]).status.value == "draft"


def test_patient_reads_their_published_report_and_scan(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    env.login(patient)

    listed = env.client.get("/api/v1/studies").json()
    assert [s["id"] for s in listed] == [study["id"]]
    report = env.client.get(f"/api/v1/studies/{study['id']}/files/report")
    assert report.headers["content-type"] == "application/pdf"
    assert hashlib.sha256(report.content).hexdigest() == study["record"]["report_sha256"]
    assert env.client.get(f"/api/v1/studies/{study['id']}/files/scan").content == png_bytes()
    heatmap = env.client.get(f"/api/v1/studies/{study['id']}/files/heatmap")
    assert heatmap.headers["content-type"] == "image/png"


def test_other_patients_and_unshared_clinicians_cannot_see_a_record(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)

    for outsider in (env.user(Role.PATIENT), env.user(Role.CLINICIAN)):
        env.login(outsider)
        assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 404
        assert env.client.get(f"/api/v1/studies/{study['id']}/files/report").status_code == 404


def test_sharing_controls_a_second_clinicians_access(env: Env) -> None:
    issuer, colleague = env.user(Role.CLINICIAN), env.user(Role.CLINICIAN, "Dr. Chen")
    patient = env.user(Role.PATIENT)
    study = env.published(issuer, patient)
    url = f"/api/v1/studies/{study['id']}"

    env.login(patient)
    assert (
        env.client.post("/api/v1/sharing", json={"clinician_id": colleague.id}).status_code == 201
    )
    env.login(colleague)
    assert env.client.get(url).status_code == 200
    assert env.client.get(f"{url}/files/report").status_code == 200
    assert [s["id"] for s in env.client.get("/api/v1/studies").json()] == [study["id"]]

    env.login(patient)
    assert env.client.delete(f"/api/v1/sharing/{colleague.id}").status_code == 204
    env.login(colleague)
    assert env.client.get(url).status_code == 404


def test_deactivated_issuers_lose_access(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    env.registry.clinicians.discard(clinician.wallet_address)

    assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 404


def test_tampered_files_fail_the_integrity_check(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    cid = study["record"]["report_cid"]
    blob = bytearray(env.storage.blobs[cid])
    blob[-1] ^= 0x01
    env.storage.blobs[cid] = bytes(blob)

    env.login(patient)
    assert env.client.get(f"/api/v1/studies/{study['id']}/files/report").status_code == 502


def test_views_are_recorded_in_the_patients_activity(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN, "Dr. Rao"), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    env.client.get(f"/api/v1/studies/{study['id']}/files/report")

    env.login(patient)
    actions = [
        e["action"] for e in env.client.get(f"/api/v1/studies/{study['id']}/activity").json()
    ]
    assert actions[:3] == ["file_viewed", "study_published", "study_created"]
    timeline = env.client.get("/api/v1/activity").json()
    assert any(e["action"] == "file_viewed" and e["actor"]["name"] == "Dr. Rao" for e in timeline)


def test_drafts_can_be_discarded_but_published_studies_cannot(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    draft = env.draft(clinician, patient)
    assert env.client.delete(f"/api/v1/studies/{draft['id']}").status_code == 204
    assert env.client.get(f"/api/v1/studies/{draft['id']}").status_code == 404

    published = env.published(clinician, patient)
    assert env.client.delete(f"/api/v1/studies/{published['id']}").status_code == 409


def test_admins_cannot_read_clinical_data(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)
    env.login(env.user(Role.ADMIN))

    assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 403
    assert env.client.get("/api/v1/studies").status_code == 403


def test_publishing_is_audited_with_its_transaction(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    study = env.published(clinician, patient)

    async def published_events() -> list[AuditEvent]:
        async with env.services.db() as db:
            rows = await db.scalars(
                select(AuditEvent).where(AuditEvent.action == "study_published")
            )
            return list(rows.unique().all())

    (event,) = env.run(published_events)
    assert event.study_id == study["id"]
    assert event.tx_hash == study["record"]["tx_hash"]
