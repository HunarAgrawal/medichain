from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import SessionManager, hash_password, verify_password
from app.main import create_app
from app.models import AuditEvent, Role
from tests.conftest import PASSWORD, Env

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"


def test_login_sets_a_hardened_session_cookie(env: Env) -> None:
    patient = env.user(Role.PATIENT, "Asha Verma")
    response = env.client.post(LOGIN, json={"email": patient.email.upper(), "password": PASSWORD})

    assert response.status_code == 200
    assert response.json()["name"] == "Asha Verma"
    cookie = response.headers["set-cookie"].lower()
    for flag in ("httponly", "samesite=strict", "path=/api", "max-age=3600"):
        assert flag in cookie
    assert env.client.get(ME).json()["id"] == patient.id


def test_wrong_password_and_unknown_email_look_identical(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    wrong = env.client.post(LOGIN, json={"email": patient.email, "password": "not the password"})
    unknown = env.client.post(LOGIN, json={"email": "nobody@example.com", "password": PASSWORD})

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password."}


def test_failed_login_is_audited_against_the_account(env: Env, services) -> None:
    patient = env.user(Role.PATIENT)
    env.client.post(LOGIN, json={"email": patient.email, "password": "not the password"})

    async def failed_logins() -> list[str]:
        async with services.db() as db:
            rows = await db.scalars(select(AuditEvent).where(AuditEvent.action == "login_failed"))
            return [e.target_user_id for e in rows.all()]

    assert env.run(failed_logins) == [patient.id]


def test_deactivated_users_cannot_sign_in(env: Env) -> None:
    admin = env.user(Role.ADMIN)
    patient = env.user(Role.PATIENT)
    env.login(admin)
    env.client.patch(f"/api/v1/admin/users/{patient.id}", json={"is_active": False})

    response = env.client.post(LOGIN, json={"email": patient.email, "password": PASSWORD})
    assert response.status_code == 401


def test_logout_revokes_the_session(env: Env) -> None:
    env.login(env.user(Role.CLINICIAN))
    cookie = env.client.cookies.get("medichain_session")
    assert env.client.post("/api/v1/auth/logout").status_code == 204

    env.client.cookies.set("medichain_session", cookie, path="/api")
    assert env.client.get(ME).status_code == 401


def test_requests_without_a_session_are_rejected(env: Env) -> None:
    assert env.client.get(ME).status_code == 401
    assert env.client.get("/api/v1/studies").status_code == 401


def test_state_changing_requests_need_the_csrf_header(services) -> None:
    with TestClient(create_app(services=services)) as bare:
        response = bare.post(LOGIN, json={"email": "a@example.com", "password": PASSWORD})
    assert response.status_code == 403
    assert "X-Requested-With" in response.json()["detail"]


def test_password_change_signs_out_other_sessions(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    env.login(patient)
    old_cookie = env.client.cookies.get("medichain_session")

    wrong = env.client.post(
        "/api/v1/auth/password",
        json={"current_password": "nope", "new_password": "a brand new passphrase"},
    )
    assert wrong.status_code == 400
    changed = env.client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "a brand new passphrase"},
    )
    assert changed.status_code == 200
    assert env.client.get(ME).status_code == 200  # the new session cookie works

    env.client.cookies.set("medichain_session", old_cookie, path="/api")
    assert env.client.get(ME).status_code == 401
    assert (
        env.client.post(LOGIN, json={"email": patient.email, "password": PASSWORD}).status_code
        == 401
    )


def test_short_new_passwords_are_rejected(env: Env) -> None:
    env.login(env.user(Role.PATIENT))
    response = env.client.post(
        "/api/v1/auth/password", json={"current_password": PASSWORD, "new_password": "short"}
    )
    assert response.status_code == 422


def test_expired_sessions_do_not_resolve(env: Env, services) -> None:
    patient = env.user(Role.PATIENT)
    expired = SessionManager(timedelta(seconds=-1))

    async def roundtrip() -> object:
        async with services.db() as db:
            token = await expired.create(db, patient)
            await db.commit()
            return await expired.resolve(db, token)

    assert env.run(roundtrip) is None


def test_login_is_rate_limited_per_account(env: Env) -> None:
    patient = env.user(Role.PATIENT)
    codes = [
        env.client.post(LOGIN, json={"email": patient.email, "password": "wrong"}).status_code
        for _ in range(6)
    ]
    assert codes == [401] * 5 + [429]


def test_password_hashes_are_salted_and_verifiable() -> None:
    first, second = hash_password("same password"), hash_password("same password")
    assert first != second
    assert verify_password("same password", first)
    assert not verify_password("other password", first)
    assert not verify_password("same password", "bcrypt$garbage")
