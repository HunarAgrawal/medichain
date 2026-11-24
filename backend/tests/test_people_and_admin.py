from fastapi.testclient import TestClient

from app.auth import SESSION_COOKIE
from app.main import create_app
from app.models import Role
from tests.conftest import CSRF, PASSWORD, Env


def test_patient_manages_their_care_team(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    doctor = env.user(Role.DOCTOR, "Dr. Chen", title="Pulmonologist")
    env.login(patient)

    assert env.client.get("/api/v1/sharing").json() == []
    shared = env.client.post("/api/v1/sharing", json={"clinician_id": doctor.id})
    assert shared.status_code == 201
    assert [m["clinician"]["name"] for m in shared.json()] == ["Dr. Chen"]
    assert env.registry.grants[patient.wallet_address] == {doctor.wallet_address}

    assert env.client.delete(f"/api/v1/sharing/{doctor.id}").status_code == 204
    assert env.client.get("/api/v1/sharing").json() == []


def test_patients_share_only_with_active_doctors_of_their_hospital(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    env.login(patient)
    for other in (
        env.user(Role.PATIENT),
        env.user(Role.TECHNICIAN),
        env.user(Role.DOCTOR, org=1),
    ):
        response = env.client.post("/api/v1/sharing", json={"clinician_id": other.id})
        assert response.status_code == 404


def test_sharing_endpoints_are_for_patients(env: Env) -> None:
    env.login(env.user(Role.DOCTOR))
    assert env.client.get("/api/v1/sharing").status_code == 403


def test_the_directory_lists_this_hospitals_clinicians(env: Env) -> None:
    env.user(Role.RADIOLOGIST, "Dr. Ananya Rao", title="Consultant Radiologist")
    env.user(Role.DOCTOR, "Dr. Arjun Mehta", title="Pulmonologist")
    env.user(Role.DOCTOR, "Dr. Elsewhere", org=1)
    env.user(Role.TECHNICIAN, "Rahul Verma")
    env.login(env.user(Role.PATIENT))

    def names(**params: str) -> list[str]:
        return [
            c["name"] for c in env.client.get("/api/v1/directory/clinicians", params=params).json()
        ]

    assert names() == ["Dr. Ananya Rao", "Dr. Arjun Mehta"]
    assert names(q="pulmo") == ["Dr. Arjun Mehta"]
    assert names(role="doctor") == ["Dr. Arjun Mehta"]


def test_staff_see_their_hospitals_sites(env: Env) -> None:
    env.organization(1)
    env.login(env.user(Role.TECHNICIAN))
    assert [s["code"] for s in env.client.get("/api/v1/sites").json()] == ["MAIN"]


def test_admin_adds_a_radiologist_who_is_verified_on_chain(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    response = env.client.post(
        "/api/v1/admin/users",
        json={
            "name": "Dr. Lena Ortiz",
            "email": "lena@example.com",
            "role": "radiologist",
            "title": "Consultant Radiologist",
            "qualification": "MD (Radiodiagnosis)",
            "registration_number": "MMC-12345",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["wallet_address"] in env.registry.clinicians
    assert body["user"]["registration_number"] == "MMC-12345"
    temporary = body["temporary_password"]
    assert temporary and len(temporary) >= 12

    env.client.cookies.delete(SESSION_COOKIE, path="/api")
    login = env.client.post(
        "/api/v1/auth/login", json={"email": "lena@example.com", "password": temporary}
    )
    assert login.status_code == 200


def test_technicians_need_no_wallet_and_patients_are_registered_elsewhere(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    _, site = env.organization()
    technician = env.client.post(
        "/api/v1/admin/users",
        json={
            "name": "Rahul Verma",
            "email": "rahul@example.com",
            "role": "technician",
            "site_id": site.id,
            "password": "a strong passphrase",
        },
    ).json()["user"]
    assert technician["wallet_address"] is None and technician["site"]["code"] == "MAIN"

    patient = {"name": "Kofi", "email": "kofi@example.com", "role": "patient"}
    assert env.client.post("/api/v1/admin/users", json=patient).status_code == 422
    duplicate = {"name": "Again", "email": "RAHUL@example.com", "role": "technician"}
    assert env.client.post("/api/v1/admin/users", json=duplicate).status_code == 409


def test_deactivating_a_radiologist_ends_sessions_and_registry_status(env: Env, services) -> None:
    admin, radiologist = env.user(Role.ADMIN), env.user(Role.RADIOLOGIST)
    with TestClient(create_app(services=services), headers=CSRF) as theirs:
        theirs.post("/api/v1/auth/login", json={"email": radiologist.email, "password": PASSWORD})
        assert theirs.get("/api/v1/auth/me").status_code == 200

        env.login(admin)
        response = env.client.patch(
            f"/api/v1/admin/users/{radiologist.id}", json={"is_active": False}
        )
        assert response.json()["is_active"] is False
        assert radiologist.wallet_address not in env.registry.clinicians
        assert theirs.get("/api/v1/auth/me").status_code == 401

    env.client.patch(f"/api/v1/admin/users/{radiologist.id}", json={"is_active": True})
    assert radiologist.wallet_address in env.registry.clinicians


def test_admins_manage_only_their_own_staff(env: Env) -> None:
    admin = env.user(Role.ADMIN)
    elsewhere = env.user(Role.RADIOLOGIST, org=1)
    patient = env.user(Role.PATIENT)
    env.login(admin)

    assert (
        env.client.patch(f"/api/v1/admin/users/{admin.id}", json={"is_active": False}).status_code
        == 422
    )
    for user in (elsewhere, patient):
        url = f"/api/v1/admin/users/{user.id}"
        assert env.client.patch(url, json={"is_active": False}).status_code == 404
    listed = {u["id"] for u in env.client.get("/api/v1/admin/users").json()}
    assert listed == {admin.id}


def test_admin_endpoints_require_the_admin_role(env: Env) -> None:
    for role in (Role.PATIENT, Role.RADIOLOGIST, Role.TECHNICIAN, Role.DOCTOR):
        env.login(env.user(role))
        for path in ("dashboard", "users", "organization", "audit"):
            assert env.client.get(f"/api/v1/admin/{path}").status_code == 403


def test_the_dashboard_reports_volume_turnaround_and_ai_agreement(env: Env) -> None:
    technician, radiologist = env.user(Role.TECHNICIAN), env.user(Role.RADIOLOGIST, "Dr. Rao")
    patient = env.user(Role.PATIENT)
    env.published(radiologist, patient, critical=True)
    env.published(radiologist, patient, final_finding="No tumor")
    env.draft(technician, patient, priority="stat")
    env.login(env.user(Role.ADMIN))

    board = env.client.get("/api/v1/admin/dashboard", params={"days": 7}).json()
    kpis = board["kpis"]
    assert kpis["studies_today"] == 3 and kpis["reported_today"] == 2
    assert kpis["awaiting_report"] == 1 and kpis["stat_waiting"] == 1
    assert kpis["ai_agreement_pct"] == 50.0 and kpis["critical_findings"] == 1
    assert kpis["within_target_pct"] == 100.0
    assert len(board["daily"]) == 7 and board["daily"][-1]["by_discipline"]["Imaging"] == 3
    assert [t["priority"] for t in board["tat_by_priority"]] == ["stat", "urgent", "routine"]
    assert board["reporters"][0]["reporter"]["name"] == "Dr. Rao"
    assert board["reporters"][0]["reports"] == 2
    assert board["sites"][0]["awaiting"] == 1
    assert board["staff"]["radiologist"] == 1 and board["patients"] == 1
    assert board["services"]["chain"]["ok"] and board["services"]["storage"]["ok"]


def test_admin_updates_the_hospital_details_printed_on_reports(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    response = env.client.patch(
        "/api/v1/admin/organization",
        json={"name": "Sunrise Hospital", "accreditation": "NABH accredited", "phone": None},
    )
    org = response.json()
    assert org["name"] == "Sunrise Hospital" and org["accreditation"] == "NABH accredited"
    cleared = env.client.patch(
        "/api/v1/admin/organization", json={"accreditation": "", "name": None}
    )
    assert cleared.json()["accreditation"] is None and cleared.json()["name"] == "Sunrise Hospital"
    assert env.client.get("/api/v1/auth/me").json()["organization"]["name"] == "Sunrise Hospital"


def test_admin_adds_sites_with_unique_codes(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    site = {"name": "Sector 18 Imaging Centre", "code": "s18", "kind": "imaging_centre"}
    created = env.client.post("/api/v1/admin/sites", json=site)
    assert created.status_code == 201 and created.json()["code"] == "S18"
    assert env.client.post("/api/v1/admin/sites", json=site).status_code == 409
    assert [s["code"] for s in env.client.get("/api/v1/admin/sites").json()] == ["MAIN", "S18"]


def test_the_audit_log_is_scoped_to_the_hospital(env: Env) -> None:
    radiologist, patient = env.user(Role.RADIOLOGIST), env.user(Role.PATIENT)
    env.published(radiologist, patient)
    env.published(env.user(Role.RADIOLOGIST, org=1), env.user(Role.PATIENT, org=1))
    env.login(env.user(Role.ADMIN))

    events = env.client.get("/api/v1/admin/audit").json()
    actions = [e["action"] for e in events]
    assert {"user_created", "patient_registered", "study_created", "study_published"} <= set(
        actions
    )
    assert actions.count("study_published") == 1
    filtered = env.client.get("/api/v1/admin/audit", params={"action": "study_published"}).json()
    assert [e["action"] for e in filtered] == ["study_published"]
