import base64
import hashlib
import io
from collections.abc import Iterator

import numpy as np
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from PIL import Image

from app.chain import AccessDeniedError, OnChainRecord, RecordNotFoundError
from app.config import Settings
from app.main import create_app
from app.ml.engine import Inference, Prediction
from app.services import Services, build_auth
from app.storage import StorageError

CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"


class FakeEngine:
    def __init__(self) -> None:
        self.calls = 0

    def preload(self) -> None:
        pass

    def predict(self, analysis_type: str, image: Image.Image) -> Inference:
        self.calls += 1
        return Inference(
            model_id="test/model",
            predictions=[Prediction("Glioma", 0.91), Prediction("No tumor", 0.09)],
            heatmap=image.copy(),
        )


class FakeStorage:
    def __init__(self) -> None:
        self.blobs: dict[str, bytes] = {}

    def put(self, data: bytes) -> str:
        digest = base64.b32encode(hashlib.sha256(data).digest()).decode().lower().rstrip("=")
        cid = f"b{digest}"
        self.blobs[cid] = data
        return cid

    async def add(self, data: bytes, filename: str) -> str:
        return self.put(data)

    async def cat(self, cid: str) -> bytes:
        if cid not in self.blobs:
            raise StorageError(f"unknown CID {cid}")
        return self.blobs[cid]


class FakeRecords:
    def __init__(self) -> None:
        self.records: dict[str, OnChainRecord] = {}
        self.grantees: dict[str, set[str]] = {}

    def create(self, patient_id: str, owner: str, scan_cid: str, report_cid: str) -> None:
        self.records[patient_id] = OnChainRecord(owner, 1_700_000_000, scan_cid, report_cid)

    async def record_exists(self, patient_id: str) -> bool:
        return patient_id in self.records

    async def get_record(self, patient_id: str, caller: str) -> OnChainRecord:
        record = self.records.get(patient_id)
        if record is None:
            raise RecordNotFoundError()
        if caller != record.owner and caller not in self.grantees.get(patient_id, set()):
            raise AccessDeniedError()
        return record


class Wallet:
    def __init__(self) -> None:
        self.account = Account.create()

    @property
    def address(self) -> str:
        return self.account.address

    def sign(self, message: str) -> str:
        return "0x" + bytes(self.account.sign_message(encode_defunct(text=message)).signature).hex()

    def sign_in(self, client: TestClient) -> dict[str, str]:
        challenge = client.post("/api/v1/auth/challenge", json={"address": self.address}).json()
        response = client.post(
            "/api/v1/auth/session",
            json={"nonce": challenge["nonce"], "signature": self.sign(challenge["message"])},
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "jwt_secret": "test-secret-" + "x" * 32,
        "encryption_key": base64.b64encode(b"k" * 32).decode(),
        "contract_address": CONTRACT_ADDRESS,
        "public_app_url": "http://localhost:5173",
        "cors_origins": "http://localhost:5173",
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def png_bytes(size: tuple[int, int] = (128, 128), mode: str = "L") -> bytes:
    gradient = np.linspace(0, 255, size[0] * size[1], dtype=np.float32).reshape(size[1], size[0])
    image = Image.fromarray(gradient.astype(np.uint8), mode="L").convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def services(settings: Settings) -> Services:
    return Services(
        settings=settings,
        auth=build_auth(settings),
        engine=FakeEngine(),
        storage=FakeStorage(),
        records=FakeRecords(),
    )


@pytest.fixture
def client(services: Services) -> Iterator[TestClient]:
    with TestClient(create_app(services=services)) as test_client:
        yield test_client


@pytest.fixture
def wallet() -> Wallet:
    return Wallet()
