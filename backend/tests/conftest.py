import base64
import hashlib
import io
import uuid
from collections import defaultdict
from collections.abc import Iterator
from datetime import date, timedelta
from functools import partial

import numpy as np
import pytest
from eth_account import Account
from eth_account.signers.local import LocalAccount
from fastapi.testclient import TestClient
from PIL import Image

from app import auth as auth_module
from app import workflows
from app.auth import SessionManager
from app.chain import ChainStatus, ContractRejected, OnChainRecord, VerifiedReport
from app.config import HARDHAT_DEV_KEY, Settings
from app.db import create_engine, create_sessionmaker
from app.main import create_app
from app.ml.engine import Inference, Prediction
from app.models import Organization, OrgKind, Role, Sex, Site, SiteKind, User
from app.services import Services
from app.storage import StorageError
from app.wallets import WalletVault

CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
PASSWORD = "correct horse battery"
CSRF = {"X-Requested-With": "XMLHttpRequest"}


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_module, "SCRYPT_N", 2**10)


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

    async def add(self, data: bytes, filename: str) -> str:
        digest = base64.b32encode(hashlib.sha256(data).digest()).decode().lower().rstrip("=")
        cid = f"b{digest}"
        self.blobs[cid] = data
        return cid

    async def cat(self, cid: str) -> bytes:
        if cid not in self.blobs:
            raise StorageError(f"unknown CID {cid}")
        return self.blobs[cid]

    async def ping(self) -> str:
        return "Fake storage"


class FakeRegistry:
    """In-memory model of MediChainRegistry with the same rules as the Solidity contract."""

    def __init__(self) -> None:
        self.operator_address = Account.from_key(HARDHAT_DEV_KEY).address
        self.clinicians: set[str] = set()
        self.records: dict[str, OnChainRecord] = {}
        self.by_hash: dict[str, str] = {}
        self.grants: defaultdict[str, set[str]] = defaultdict(set)
        self._tx = 0

    def _tx_hash(self) -> str:
        self._tx += 1
        return f"0x{self._tx:064x}"

    async def is_clinician(self, account: str) -> bool:
        return account in self.clinicians

    async def can_access(self, record_id: str, account: str) -> bool:
        record = self.records.get(record_id)
        if record is None:
            return False
        if account == record.patient:
            return True
        named = account in (record.issuer, record.referrer)
        return account in self.clinicians and (named or account in self.grants[record.patient])

    async def get_record(self, record_id: str, caller: str) -> OnChainRecord:
        if record_id not in self.records:
            raise ContractRejected("RecordNotFound")
        if not await self.can_access(record_id, caller):
            raise ContractRejected("AccessDenied")
        return self.records[record_id]

    async def verify_report(self, report_sha256: str) -> VerifiedReport | None:
        record_id = self.by_hash.get(report_sha256)
        if record_id is None:
            return None
        record = self.records[record_id]
        return VerifiedReport(record_id, record.issuer, record.published_at)

    async def clinicians_of(self, patient: str) -> list[str]:
        return sorted(self.grants[patient])

    async def patients_of(self, clinician: str) -> list[str]:
        return sorted(p for p, granted in self.grants.items() if clinician in granted)

    async def set_clinician(self, clinician: str, active: bool) -> str:
        (self.clinicians.add if active else self.clinicians.discard)(clinician)
        return self._tx_hash()

    async def publish_record(
        self,
        signer: LocalAccount,
        record_id: str,
        patient: str,
        referrer: str | None,
        report_sha256: str,
        scan_cid: str,
        report_cid: str,
    ) -> str:
        if signer.address not in self.clinicians:
            raise ContractRejected("NotClinician")
        if referrer and (referrer == patient or referrer not in self.clinicians):
            raise ContractRejected("InvalidReferrer")
        if record_id in self.records:
            raise ContractRejected("RecordAlreadyExists")
        if report_sha256 in self.by_hash:
            raise ContractRejected("DuplicateReport")
        self.records[record_id] = OnChainRecord(
            patient, 1_700_000_000, signer.address, report_sha256, scan_cid, report_cid, referrer
        )
        self.by_hash[report_sha256] = record_id
        return self._tx_hash()

    async def grant_access(self, signer: LocalAccount, clinician: str) -> str:
        if clinician not in self.clinicians:
            raise ContractRejected("NotClinician")
        self.grants[signer.address].add(clinician)
        return self._tx_hash()

    async def revoke_access(self, signer: LocalAccount, clinician: str) -> str:
        self.grants[signer.address].discard(clinician)
        return self._tx_hash()

    async def status(self) -> ChainStatus:
        return ChainStatus(42, self.operator_address, self.operator_address, 10**18)


def make_settings(tmp_path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "log_level": "WARNING",
        "demo_mode": True,
        "database_url": f"sqlite+aiosqlite:///{tmp_path}/test.db",
        "encryption_key": base64.b64encode(b"k" * 32).decode(),
        "wallet_encryption_key": base64.b64encode(b"w" * 32).decode(),
        "operator_private_key": HARDHAT_DEV_KEY,
        "contract_address": CONTRACT_ADDRESS,
        "public_app_url": "http://localhost:3000",
        "cors_origins": "http://localhost:3000",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def png_bytes(size: tuple[int, int] = (128, 128), mode: str = "L") -> bytes:
    gradient = np.linspace(0, 255, size[0] * size[1], dtype=np.float32).reshape(size[1], size[0])
    image = Image.fromarray(gradient.astype(np.uint8), mode="L").convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def build_services(settings: Settings) -> Services:
    engine = create_engine(settings.database_url)
    return Services(
        settings=settings,
        db_engine=engine,
        db=create_sessionmaker(engine),
        sessions=SessionManager(timedelta(hours=1)),
        vault=WalletVault(settings.wallet_key_bytes),
        ml=FakeEngine(),
        storage=FakeStorage(),
        registry=FakeRegistry(),
    )


class Env:
    """A running app plus helpers to create an organization, its people, and act as them."""

    def __init__(self, client: TestClient, services: Services) -> None:
        self.client = client
        self.services = services
        self._orgs: list[tuple[Organization, Site]] = []

    @property
    def registry(self) -> FakeRegistry:
        return self.services.registry  # type: ignore[return-value]

    @property
    def storage(self) -> FakeStorage:
        return self.services.storage  # type: ignore[return-value]

    def run(self, fn, *args, **kwargs):
        return self.client.portal.call(partial(fn, *args, **kwargs))

    def organization(self, index: int = 0) -> tuple[Organization, Site]:
        """A test hospital and its first site. Index 1 is a second, unrelated tenant."""
        while len(self._orgs) <= index:
            number = len(self._orgs) + 1

            async def create(number: int = number) -> tuple[Organization, Site]:
                async with self.services.db() as db:
                    org = await workflows.create_organization(
                        db,
                        name=f"Test Hospital {number}",
                        short_name=f"Hospital {number}",
                        kind=OrgKind.HOSPITAL,
                        uhid_prefix=f"TH{number}",
                        city="Pune",
                    )
                    site = await workflows.create_site(
                        db,
                        org_id=org.id,
                        name="Radiology",
                        code="MAIN",
                        kind=SiteKind.RADIOLOGY_DEPARTMENT,
                    )
                    await db.commit()
                    return org, site

            self._orgs.append(self.run(create))
        return self._orgs[index]

    def user(self, role: Role, name: str | None = None, org: int = 0, **kwargs: object) -> User:
        """Staff with a password, or a patient with portal access, in organization `org`."""
        organization, _ = self.organization(org)
        email = f"{uuid.uuid4().hex[:10]}@example.com"

        async def create() -> User:
            async with self.services.db() as db:
                if role is Role.PATIENT:
                    return await workflows.register_patient(
                        self.services,
                        db,
                        org=organization,
                        actor=None,
                        name=name or "Test patient",
                        sex=Sex.FEMALE,
                        date_of_birth=date(1980, 1, 1),
                        email=email,
                        password=PASSWORD,
                        **kwargs,
                    )
                return await workflows.create_staff(
                    self.services,
                    db,
                    org_id=organization.id,
                    name=name or f"Test {role.value}",
                    email=email,
                    role=role,
                    password=PASSWORD,
                    **kwargs,
                )

        return self.run(create)

    def login(self, user: User, password: str = PASSWORD) -> None:
        response = self.client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": password}
        )
        assert response.status_code == 200, response.text

    def draft(
        self, actor: User, patient: User, analysis_type: str = "brain_tumor", **fields: str
    ) -> dict:
        """Acquire a study as `actor` (a technician or radiologist)."""
        self.login(actor)
        response = self.client.post(
            "/api/v1/studies",
            data={"patient_id": patient.id, "analysis_type": analysis_type, **fields},
            files={"file": ("scan.png", png_bytes(), "image/png")},
        )
        assert response.status_code == 201, response.text
        return response.json()

    def published(
        self, radiologist: User, patient: User, referrer: User | None = None, **report: object
    ) -> dict:
        """Acquire and report a study as `radiologist`, optionally for a referring doctor."""
        fields = {"referrer_id": referrer.id} if referrer else {}
        study = self.draft(radiologist, patient, **fields)
        response = self.client.post(
            f"/api/v1/studies/{study['id']}/publish",
            json={
                "final_finding": "Glioma",
                "impression": "Enhancing left frontal mass.",
                **report,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()


@pytest.fixture
def services(tmp_path) -> Services:
    return build_services(make_settings(tmp_path))


@pytest.fixture
def env(services: Services) -> Iterator[Env]:
    with TestClient(create_app(services=services), headers=CSRF) as client:
        yield Env(client, services)
