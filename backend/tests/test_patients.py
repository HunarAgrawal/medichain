from app.auth import SESSION_COOKIE
from app.models import Role
from tests.conftest import Env

NEW_PATIENT = {
    "name": "Rakesh Kumar",
    "sex": "M",
    "date_of_birth": "1968-07-21",
    "phone": "+91 98765 43210",
    "abha_number": "12-3456-7890-1234",
}


def test_technician_registers_a_walk_in_patient_with_a_uhid(env: Env) -> None:
    env.login(env.user(Role.TECHNICIAN))
    response = env.client.post("/api/v1/patients", json=NEW_PATIENT)

    assert response.status_code == 201
    patient = response.json()
    assert patient["uhid"].startswith("TH1-") and patient["uhid"].endswith("000001")
    assert patient["sex"] == "M" and patient["age"] >= 58
    assert patient["portal_access"] is False and patient["email"] is None
    second = env.client.post("/api/v1/patients", json={**NEW_PATIENT, "name": "Second"}).json()
    assert second["uhid"].endswith("000002")


def test_the_registry_searches_by_name_uhid_and_phone(env: Env) -> None:
    env.login(env.user(Role.TECHNICIAN))
    patient = env.client.post("/api/v1/patients", json=NEW_PATIENT).json()
    env.client.post("/api/v1/patients", json={**NEW_PATIENT, "name": "Meera Iyer", "phone": None})

    def names(q: str) -> list[str]:
        return [p["name"] for p in env.client.get("/api/v1/patients", params={"q": q}).json()]

    assert names("rakesh") == ["Rakesh Kumar"]
    assert names(patient["uhid"]) == ["Rakesh Kumar"]
    assert names("43210") == ["Rakesh Kumar"]
    assert names("98765 43210") == ["Rakesh Kumar"]
    assert sorted(names("")) == ["Meera Iyer", "Rakesh Kumar"]


def test_registration_rejects_invalid_details(env: Env) -> None:
    env.login(env.user(Role.TECHNICIAN))
    for change in (
        {"date_of_birth": "2999-01-01"},
        {"phone": "call me"},
        {"abha_number": "1234"},
        {"sex": "X"},
        {"name": "<script>"},
    ):
        response = env.client.post("/api/v1/patients", json={**NEW_PATIENT, **change})
        assert response.status_code == 422, change


def test_only_acquiring_staff_register_patients(env: Env) -> None:
    for role in (Role.DOCTOR, Role.ADMIN, Role.PATIENT):
        env.login(env.user(role))
        assert env.client.post("/api/v1/patients", json=NEW_PATIENT).status_code == 403


def test_referring_doctors_see_only_their_patients(env: Env) -> None:
    technician, doctor = env.user(Role.TECHNICIAN), env.user(Role.DOCTOR)
    referred, other = env.user(Role.PATIENT, "Referred"), env.user(Role.PATIENT, "Unrelated")
    env.draft(technician, referred, referrer_id=doctor.id)

    env.login(doctor)
    assert [p["name"] for p in env.client.get("/api/v1/patients").json()] == ["Referred"]
    assert env.client.get(f"/api/v1/patients/{other.id}").status_code == 404
    profile = env.client.get(f"/api/v1/patients/{referred.id}").json()
    assert profile["studies"] == 1


def test_patients_of_another_hospital_are_invisible(env: Env) -> None:
    elsewhere = env.user(Role.PATIENT, "Elsewhere", org=1)
    env.login(env.user(Role.TECHNICIAN))
    assert env.client.get("/api/v1/patients").json() == []
    assert env.client.get(f"/api/v1/patients/{elsewhere.id}").status_code == 404


def test_staff_can_give_a_patient_portal_access(env: Env) -> None:
    env.login(env.user(Role.TECHNICIAN))
    patient = env.client.post("/api/v1/patients", json=NEW_PATIENT).json()
    url = f"/api/v1/patients/{patient['id']}/portal"

    enabled = env.client.post(url, json={"email": "rakesh@example.com"})
    assert enabled.status_code == 200
    body = enabled.json()
    assert body["patient"]["portal_access"] is True
    assert env.client.post(url, json={"email": "again@example.com"}).status_code == 409

    env.client.cookies.delete(SESSION_COOKIE, path="/api")
    login = env.client.post(
        "/api/v1/auth/login",
        json={"email": "rakesh@example.com", "password": body["temporary_password"]},
    )
    assert login.status_code == 200 and login.json()["role"] == "patient"


def test_patients_without_portal_access_cannot_sign_in(env: Env) -> None:
    env.login(env.user(Role.TECHNICIAN))
    env.client.post("/api/v1/patients", json=NEW_PATIENT)
    response = env.client.post(
        "/api/v1/auth/login", json={"email": "rakesh@example.com", "password": "anything at all"}
    )
    assert response.status_code == 401
