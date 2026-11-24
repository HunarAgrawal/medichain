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


def _publish(env: Env, study_id: str, **body: object) -> int:
    payload = {"final_finding": "Glioma", "impression": "Enhancing left frontal mass.", **body}
    return env.client.post(f"/api/v1/studies/{study_id}/publish", json=payload).status_code


def test_technician_acquires_a_study_for_the_reporting_worklist(env: Env) -> None:
    technician = env.user(Role.TECHNICIAN)
    doctor = env.user(Role.DOCTOR, "Dr. Mehta")
    patient = env.user(Role.PATIENT, "Asha Verma")

    study = env.draft(
        technician,
        patient,
        priority="stat",
        indication="Acute breathlessness.",
        referrer_id=doctor.id,
    )

    assert study["status"] == "draft" and study["priority"] == "stat"
    assert study["accession"].startswith("ACC-") and study["accession"].endswith("-0001")
    assert study["patient"]["name"] == "Asha Verma" and study["patient"]["uhid"].startswith("TH1-")
    assert study["referred_by"] == "Dr. Mehta" and study["site"]["code"] == "MAIN"
    # Technicians track status; the AI pre-read is for the radiologist.
    assert study["access"] == "status" and study["predictions"] == []
    assert study["created_at"].endswith(("+00:00", "Z")), "timestamps must carry their timezone"

    stored = _get_study(env, study["id"])
    assert png_bytes() not in stored.draft_scan
    key = env.services.settings.encryption_key_bytes
    assert unseal(key, stored.draft_scan, kind="scan", subject=stored.id) == png_bytes()

    env.login(env.user(Role.RADIOLOGIST))
    detail = env.client.get(f"/api/v1/studies/{study['id']}").json()
    assert detail["access"] == "full"
    assert detail["predictions"][0] == {"label": "Glioma", "score": 0.91}
    assert detail["indication"] == "Acute breathlessness." and detail["has_heatmap"] is True


def test_only_acquiring_staff_can_create_studies(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    for actor in (patient, env.user(Role.DOCTOR), env.user(Role.ADMIN)):
        env.login(actor)
        response = env.client.post(
            "/api/v1/studies",
            data={"patient_id": patient.id, "analysis_type": "brain_tumor"},
            files={"file": ("scan.png", png_bytes(), "image/png")},
        )
        assert response.status_code == 403


def test_a_study_needs_a_patient_site_and_image_from_this_hospital(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST)
    patient = env.user(Role.PATIENT)
    elsewhere = env.user(Role.PATIENT, org=1)
    env.login(technician)

    def create(payload: bytes = png_bytes(), **fields: str) -> int:
        data = {"patient_id": patient.id, "analysis_type": "chest_xray", **fields}
        files = {"file": ("scan.png", payload, "image/png")}
        return env.client.post("/api/v1/studies", data=data, files=files).status_code

    assert create(patient_id=elsewhere.id) == 404
    assert create(patient_id=radiologist.id) == 404
    assert create(site_id="missing") == 404
    assert create(referrer_id=radiologist.id) == 404, "referrers are doctors"
    assert create(priority="whenever") == 422
    assert create(b"%PDF-1.7 not an image") == 415
    assert create(png_bytes(size=(32, 32))) == 422


def test_the_worklist_puts_stat_first_then_the_longest_waiting(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST)
    patient = env.user(Role.PATIENT)
    routine = env.draft(technician, patient, priority="routine")
    stat = env.draft(technician, patient, priority="stat")
    urgent = env.draft(technician, patient, priority="urgent")
    assert [routine["accession"][-4:], stat["accession"][-4:]] == ["0001", "0002"]

    env.login(radiologist)
    worklist = env.client.get(
        "/api/v1/studies", params={"status": "draft", "order": "worklist"}
    ).json()
    assert [s["id"] for s in worklist] == [stat["id"], urgent["id"], routine["id"]]
    assert {s["top_finding"] for s in worklist} == {"Glioma"}


def test_reporting_anchors_an_encrypted_report_with_its_referrer(env: Env) -> None:
    radiologist = env.user(Role.RADIOLOGIST, "Dr. Rao", title="Consultant Radiologist")
    doctor, patient = env.user(Role.DOCTOR), env.user(Role.PATIENT)
    study = env.published(
        radiologist, patient, referrer=doctor, findings="Left frontal lesion.", critical=True
    )

    record = study["record"]
    assert study["status"] == "published" and study["critical"] is True
    assert study["final_finding"] == "Glioma" and study["ai_agrees"] is True
    assert study["findings"] == "Left frontal lesion."
    assert study["radiologist"]["name"] == "Dr. Rao" and study["turnaround_minutes"] >= 0
    on_chain = env.registry.records[record["record_id"]]
    assert on_chain.patient == patient.wallet_address
    assert on_chain.issuer == radiologist.wallet_address
    assert on_chain.referrer == doctor.wallet_address
    assert on_chain.report_hash == record["report_sha256"]

    report_blob = env.storage.blobs[record["report_cid"]]
    assert b"%PDF" not in report_blob
    key = env.services.settings.encryption_key_bytes
    report = unseal(key, report_blob, kind="report", subject=study["id"])
    assert hashlib.sha256(report).hexdigest() == record["report_sha256"]
    assert _get_study(env, study["id"]).draft_scan is None


def test_any_radiologist_in_the_hospital_can_report_a_draft(env: Env) -> None:
    technician, patient = env.user(Role.TECHNICIAN), env.user(Role.PATIENT)
    study = env.draft(technician, patient)

    env.login(env.user(Role.RADIOLOGIST, org=1))
    assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 404
    assert _publish(env, study["id"]) == 404

    env.login(technician)
    assert _publish(env, study["id"]) == 403
    env.login(env.user(Role.RADIOLOGIST))
    assert _publish(env, study["id"]) == 200
    assert _publish(env, study["id"]) == 409, "a study is reported once"


def test_unverified_radiologists_cannot_sign(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    study = env.draft(radiologist, patient)
    env.registry.clinicians.discard(radiologist.wallet_address)

    assert _publish(env, study["id"]) == 403
    assert _get_study(env, study["id"]).status.value == "draft"


def test_the_referring_doctor_sees_status_then_the_signed_report(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST)
    doctor, other_doctor = env.user(Role.DOCTOR), env.user(Role.DOCTOR)
    patient = env.user(Role.PATIENT)
    study = env.draft(technician, patient, referrer_id=doctor.id)
    url = f"/api/v1/studies/{study['id']}"

    env.login(doctor)
    pending = env.client.get(url).json()
    assert pending["access"] == "status" and pending["predictions"] == []
    assert env.client.get(f"{url}/files/scan").status_code == 404

    env.login(radiologist)
    assert _publish(env, study["id"], critical=True) == 200

    env.login(doctor)
    signed = env.client.get(url).json()
    assert signed["access"] == "full" and signed["critical"] is True
    assert env.client.get(f"{url}/files/report").status_code == 200
    alerts = env.client.get("/api/v1/studies", params={"critical": True}).json()
    assert [s["id"] for s in alerts] == [study["id"]]

    env.login(other_doctor)
    assert env.client.get(url).status_code == 404
    assert env.client.get("/api/v1/studies").json() == []


def test_patient_reads_their_signed_report_and_scan(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    draft = env.draft(radiologist, patient)
    study = env.published(radiologist, patient)
    env.login(patient)

    listed = env.client.get("/api/v1/studies").json()
    assert [s["id"] for s in listed] == [study["id"]], "drafts stay with the hospital"
    assert env.client.get(f"/api/v1/studies/{draft['id']}").status_code == 404
    report = env.client.get(f"/api/v1/studies/{study['id']}/files/report")
    assert report.headers["content-type"] == "application/pdf"
    assert hashlib.sha256(report.content).hexdigest() == study["record"]["report_sha256"]
    assert env.client.get(f"/api/v1/studies/{study['id']}/files/scan").content == png_bytes()
    heatmap = env.client.get(f"/api/v1/studies/{study['id']}/files/heatmap")
    assert heatmap.headers["content-type"] == "image/png"


def test_other_patients_and_unrelated_doctors_cannot_see_a_record(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    study = env.published(radiologist, patient)

    for outsider in (env.user(Role.PATIENT), env.user(Role.DOCTOR), env.user(Role.DOCTOR, org=1)):
        env.login(outsider)
        assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 404
        assert env.client.get(f"/api/v1/studies/{study['id']}/files/report").status_code == 404


def test_sharing_controls_a_doctors_access(env: Env) -> None:
    radiologist, doctor = env.user(Role.RADIOLOGIST), env.user(Role.DOCTOR, "Dr. Chen")
    patient = env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    url = f"/api/v1/studies/{study['id']}"

    env.login(patient)
    assert env.client.post("/api/v1/sharing", json={"clinician_id": doctor.id}).status_code == 201
    env.login(doctor)
    assert env.client.get(url).json()["access"] == "full"
    assert env.client.get(f"{url}/files/report").status_code == 200
    assert [s["id"] for s in env.client.get("/api/v1/studies").json()] == [study["id"]]

    env.login(patient)
    assert env.client.delete(f"/api/v1/sharing/{doctor.id}").status_code == 204
    env.login(doctor)
    assert env.client.get(url).status_code == 404


def test_deactivated_radiologists_lose_access_to_their_reports(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    env.registry.clinicians.discard(radiologist.wallet_address)

    detail = env.client.get(f"/api/v1/studies/{study['id']}").json()
    assert detail["access"] == "status" and detail["impression"] is None
    assert env.client.get(f"/api/v1/studies/{study['id']}/files/report").status_code == 404


def test_technicians_see_status_only(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST)
    patient = env.user(Role.PATIENT)
    draft = env.draft(technician, patient)
    signed = env.published(radiologist, patient)

    env.login(technician)
    rows = {s["id"]: s for s in env.client.get("/api/v1/studies").json()}
    assert rows[signed["id"]]["status"] == "published"
    assert rows[signed["id"]]["top_finding"] is None
    assert env.client.get(f"/api/v1/studies/{draft['id']}/files/scan").status_code == 200
    assert env.client.get(f"/api/v1/studies/{draft['id']}/files/heatmap").status_code == 404
    assert env.client.get(f"/api/v1/studies/{signed['id']}/files/report").status_code == 404


def test_tampered_files_fail_the_integrity_check(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    cid = study["record"]["report_cid"]
    blob = bytearray(env.storage.blobs[cid])
    blob[-1] ^= 0x01
    env.storage.blobs[cid] = bytes(blob)

    env.login(patient)
    assert env.client.get(f"/api/v1/studies/{study['id']}/files/report").status_code == 502


def test_views_are_recorded_in_the_patients_activity(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST, "Dr. Rao"), env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    env.client.get(f"/api/v1/studies/{study['id']}/files/report")

    env.login(patient)
    actions = [
        e["action"] for e in env.client.get(f"/api/v1/studies/{study['id']}/activity").json()
    ]
    assert actions[:3] == ["file_viewed", "study_published", "study_created"]
    timeline = env.client.get("/api/v1/activity").json()
    assert any(e["action"] == "file_viewed" and e["actor"]["name"] == "Dr. Rao" for e in timeline)


def test_unreported_studies_can_be_discarded_by_their_technician(env: Env) -> None:
    technician, colleague = env.user(Role.TECHNICIAN), env.user(Role.TECHNICIAN)
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    draft = env.draft(technician, patient)

    env.login(colleague)
    assert env.client.delete(f"/api/v1/studies/{draft['id']}").status_code == 409
    env.login(technician)
    assert env.client.delete(f"/api/v1/studies/{draft['id']}").status_code == 204
    assert env.client.get(f"/api/v1/studies/{draft['id']}").status_code == 404

    signed = env.published(radiologist, patient)
    assert env.client.delete(f"/api/v1/studies/{signed['id']}").status_code == 409


def test_admins_cannot_read_clinical_data(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    study = env.published(radiologist, patient)
    env.login(env.user(Role.ADMIN))

    assert env.client.get(f"/api/v1/studies/{study['id']}").status_code == 403
    assert env.client.get("/api/v1/studies").status_code == 403


def test_reporting_is_audited_with_its_transaction(env: Env) -> None:
    radiologist, doctor = env.user(Role.RADIOLOGIST), env.user(Role.DOCTOR)
    study = env.published(radiologist, env.user(Role.PATIENT), referrer=doctor, critical=True)

    async def events(action: str) -> list[AuditEvent]:
        async with env.services.db() as db:
            rows = await db.scalars(select(AuditEvent).where(AuditEvent.action == action))
            return list(rows.unique().all())

    (published,) = env.run(events, "study_published")
    assert published.study_id == study["id"]
    assert published.tx_hash == study["record"]["tx_hash"]
    (critical,) = env.run(events, "critical_finding")
    assert critical.target_user_id == doctor.id
