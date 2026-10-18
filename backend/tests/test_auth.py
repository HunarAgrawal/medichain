from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthError, WalletAuth
from app.main import create_app
from app.services import Services, build_auth
from tests.conftest import Wallet, make_settings

CHALLENGE = "/api/v1/auth/challenge"
SESSION = "/api/v1/auth/session"


def test_sign_in_returns_session_for_signer(client: TestClient, wallet: Wallet) -> None:
    challenge = client.post(CHALLENGE, json={"address": wallet.address.lower()}).json()

    assert wallet.address in challenge["message"]
    assert f"Nonce: {challenge['nonce']}" in challenge["message"]
    assert challenge["message"].startswith("localhost:5173 wants you to sign in")

    response = client.post(
        SESSION, json={"nonce": challenge["nonce"], "signature": wallet.sign(challenge["message"])}
    )
    assert response.status_code == 200
    assert response.json()["address"] == wallet.address


def test_challenge_cannot_be_reused(client: TestClient, wallet: Wallet) -> None:
    challenge = client.post(CHALLENGE, json={"address": wallet.address}).json()
    body = {"nonce": challenge["nonce"], "signature": wallet.sign(challenge["message"])}

    assert client.post(SESSION, json=body).status_code == 200
    assert client.post(SESSION, json=body).status_code == 401


def test_signature_from_another_wallet_is_rejected(client: TestClient, wallet: Wallet) -> None:
    challenge = client.post(CHALLENGE, json={"address": wallet.address}).json()
    forged = Wallet().sign(challenge["message"])

    response = client.post(SESSION, json={"nonce": challenge["nonce"], "signature": forged})
    assert response.status_code == 401
    assert "does not match" in response.json()["detail"]


def test_invalid_address_is_rejected(client: TestClient) -> None:
    assert client.post(CHALLENGE, json={"address": "0x123"}).status_code == 422


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer not-a-token"}, {"Authorization": "Basic abc"}],
)
def test_protected_routes_require_a_valid_token(client: TestClient, headers: dict) -> None:
    response = client.get("/api/v1/records/P001/report", headers=headers)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_expired_token_is_rejected() -> None:
    auth = build_auth(make_settings(jwt_ttl_minutes=-1))
    session = auth.issue_session(Wallet().address)
    with pytest.raises(AuthError):
        auth.authenticate(session.token)


def test_token_signed_with_other_secret_is_rejected(wallet: Wallet) -> None:
    other = WalletAuth(
        secret="another-secret-" + "y" * 32,
        token_ttl=timedelta(minutes=5),
        app_url="http://localhost:5173",
        chain_id=31337,
        allowed_wallets=[],
    )
    token = other.issue_session(wallet.address).token
    with pytest.raises(AuthError):
        build_auth(make_settings()).authenticate(token)


def test_allowlist_blocks_other_wallets(services: Services, wallet: Wallet) -> None:
    settings = make_settings(allowed_wallets=wallet.address)
    services.settings = settings
    services.auth = build_auth(settings)
    with TestClient(create_app(services=services)) as client:
        assert client.post(CHALLENGE, json={"address": wallet.address}).status_code == 200
        response = client.post(CHALLENGE, json={"address": Wallet().address})
        assert response.status_code == 403


def test_sign_in_is_rate_limited(client: TestClient, wallet: Wallet) -> None:
    statuses = [
        client.post(CHALLENGE, json={"address": wallet.address}).status_code for _ in range(21)
    ]
    assert statuses[:20] == [200] * 20
    assert statuses[20] == 429
