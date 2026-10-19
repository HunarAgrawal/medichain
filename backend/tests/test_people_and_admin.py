from fastapi.testclient import TestClient

from app.auth import SESSION_COOKIE
from app.main import create_app
from app.models import Role
from tests.conftest import CSRF, Env


def test_patient_manages_their_care_team(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    clinician = env.user(Role.CLINICIAN, "Dr. Chen", title="Pulmonologist")
    env.login(patient)

    assert env.client.get("/api/v1/sharing").json() == []
    shared = env.client.post("/api/v1/sharing", json={"clinician_id": clinician.id})
    assert shared.status_code == 201
    assert [m["clinician"]["name"] for m in shared.json()] == ["Dr. Chen"]
    assert env.registry.grants[patient.wallet_address] == {clinician.wallet_address}

    assert env.client.delete(f"/api/v1/sharing/{clinician.id}").status_code == 204
    assert env.client.get("/api/v1/sharing").json() == []


def test_only_active_clinicians_can_be_shared_with(env: Env) -> None:
    patient, other_patient = env.user(Role.PATIENT), env.user(Role.PATIENT)
    env.login(patient)
    response = env.client.post("/api/v1/sharing", json={"clinician_id": other_patient.id})
    assert response.status_code == 404


def test_sharing_endpoints_are_for_patients(env: Env) -> None:
    env.login(env.user(Role.CLINICIAN))
    assert env.client.get("/api/v1/sharing").status_code == 403


def test_directories_respect_roles(env: Env) -> None:
    env.user(Role.CLINICIAN, "Dr. Ananya Rao", title="Radiologist")
    patient = env.user(Role.PATIENT, "Priya Sharma")
    env.login(patient)
    found = env.client.get("/api/v1/directory/clinicians", params={"q": "radio"}).json()
    assert [c["name"] for c in found] == ["Dr. Ananya Rao"]
    assert env.client.get("/api/v1/directory/patients").status_code == 403

    env.login(env.user(Role.CLINICIAN))
    patients = env.client.get("/api/v1/directory/patients", params={"q": "priya"}).json()
    assert [p["patient"]["name"] for p in patients] == ["Priya Sharma"]


def test_clinician_patient_list_covers_issued_and_shared(env: Env) -> None:
    clinician = env.user(Role.CLINICIAN)
    issued_for = env.user(Role.PATIENT, "Issued Patient")
    sharer = env.user(Role.PATIENT, "Sharing Patient")
    env.published(clinician, issued_for)
    env.login(sharer)
    env.client.post("/api/v1/sharing", json={"clinician_id": clinician.id})

    env.login(clinician)
    rows = {r["patient"]["name"]: r for r in env.client.get("/api/v1/patients").json()}
    assert rows["Issued Patient"]["published_studies"] == 1
    assert rows["Issued Patient"]["shared_with_me"] is False
    assert rows["Sharing Patient"]["shared_with_me"] is True


def test_admin_creates_a_clinician_who_is_verified_on_chain(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    response = env.client.post(
        "/api/v1/admin/users",
        json={
            "name": "Dr. Lena Ortiz",
            "email": "lena@example.com",
            "role": "clinician",
            "title": "Radiologist",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["wallet_address"] in env.registry.clinicians
    temporary = body["temporary_password"]
    assert temporary and len(temporary) >= 12

    login = env.client.post(
        "/api/v1/auth/login", json={"email": "lena@example.com", "password": temporary}
    )
    assert login.status_code == 200


def test_admin_creates_patients_with_wallets_but_no_registry_role(env: Env) -> None:
    env.login(env.user(Role.ADMIN))
    response = env.client.post(
        "/api/v1/admin/users",
        json={
            "name": "Kofi Mensah",
            "email": "kofi@example.com",
            "role": "patient",
            "date_of_birth": "1990-05-01",
            "password": "a strong passphrase",
        },
    )
    user = response.json()["user"]
    assert response.json()["temporary_password"] is None
    assert user["wallet_address"] and user["wallet_address"] not in env.registry.clinicians
    duplicate = env.client.post(
        "/api/v1/admin/users",
        json={"name": "Kofi again", "email": "KOFI@example.com", "role": "patient"},
    )
    assert duplicate.status_code == 409


def test_deactivating_a_clinician_ends_sessions_and_registry_status(env: Env, services) -> None:
    admin, clinician = env.user(Role.ADMIN), env.user(Role.CLINICIAN)
    with TestClient(create_app(services=services), headers=CSRF) as theirs:
        theirs.post(
            "/api/v1/auth/login",
            json={"email": clinician.email, "password": "correct horse battery"},
        )
        assert theirs.get("/api/v1/auth/me").status_code == 200

        env.login(admin)
        response = env.client.patch(
            f"/api/v1/admin/users/{clinician.id}", json={"is_active": False}
        )
        assert response.json()["is_active"] is False
        assert clinician.wallet_address not in env.registry.clinicians
        assert theirs.get("/api/v1/auth/me").status_code == 401
        assert theirs.cookies.get(SESSION_COOKIE)

    env.client.patch(f"/api/v1/admin/users/{clinician.id}", json={"is_active": True})
    assert clinician.wallet_address in env.registry.clinicians


def test_admins_cannot_deactivate_themselves(env: Env) -> None:
    admin = env.user(Role.ADMIN)
    env.login(admin)
    response = env.client.patch(f"/api/v1/admin/users/{admin.id}", json={"is_active": False})
    assert response.status_code == 422


def test_admin_endpoints_require_the_admin_role(env: Env) -> None:
    for role in (Role.PATIENT, Role.CLINICIAN):
        env.login(env.user(role))
        assert env.client.get("/api/v1/admin/overview").status_code == 403
        assert env.client.get("/api/v1/admin/users").status_code == 403


def test_admin_overview_and_audit_log(env: Env) -> None:
    clinician, patient = env.user(Role.CLINICIAN), env.user(Role.PATIENT)
    env.published(clinician, patient)
    env.login(env.user(Role.ADMIN))

    overview = env.client.get("/api/v1/admin/overview").json()
    assert overview["users"] == {"patient": 1, "clinician": 1, "admin": 1}
    assert overview["studies"] == {"draft": 0, "published": 1}
    assert overview["services"]["chain"]["ok"] and overview["services"]["ipfs"]["ok"]

    actions = [e["action"] for e in env.client.get("/api/v1/admin/audit").json()]
    assert {"user_created", "study_created", "study_published", "login"} <= set(actions)
    filtered = env.client.get("/api/v1/admin/audit", params={"action": "study_published"}).json()
    assert [e["action"] for e in filtered] == ["study_published"]
