from datetime import UTC, date, datetime

import pytest
from PIL import Image

from app.crypto import IntegrityError, seal, unseal
from app.imaging import decode_scan
from app.ml.engine import Prediction
from app.models import Role, User
from app.report import ReportInput, render_report
from app.wallets import WalletVault
from tests.conftest import png_bytes

KEY = b"k" * 32


def test_seal_round_trip_and_binding() -> None:
    blob = seal(KEY, b"payload", kind="scan", subject="study-1")

    assert unseal(KEY, blob, kind="scan", subject="study-1") == b"payload"
    for kind, subject, key in [
        ("report", "study-1", KEY),
        ("scan", "study-2", KEY),
        ("scan", "study-1", b"x" * 32),
    ]:
        with pytest.raises(IntegrityError):
            unseal(key, blob, kind=kind, subject=subject)
    with pytest.raises(IntegrityError):
        unseal(KEY, blob[:10], kind="scan", subject="study-1")


def test_wallet_keys_are_sealed_per_user() -> None:
    vault = WalletVault(b"w" * 32)
    alice = User(id="alice", email="a@example.com", name="A", role=Role.PATIENT, password_hash="x")
    vault.create(alice)

    assert alice.wallet_address and alice.wallet_key
    assert vault.signer(alice).address == alice.wallet_address
    mallory = User(
        id="mallory", email="m@example.com", name="M", role=Role.PATIENT, password_hash="x"
    )
    mallory.wallet_key = alice.wallet_key
    with pytest.raises(IntegrityError):
        vault.signer(mallory)


def test_sixteen_bit_scans_are_normalised() -> None:
    scan = decode_scan(png_bytes(mode="I;16"))
    assert scan.image.mode == "RGB" and scan.media_type == "image/png"


def test_report_renders_and_escapes_user_text() -> None:
    pdf = render_report(
        ReportInput(
            report_id="study-1",
            record_id="0x" + "ab" * 32,
            published_at=datetime(2026, 10, 19, tzinfo=UTC),
            patient_name="<b>Ann & Co</b>",
            patient_reference="MC-1234ABCD",
            patient_dob=date(1979, 3, 14),
            analysis_name="Brain tumor",
            modality="MRI",
            model_id="test/model",
            predictions=[Prediction("Glioma", 0.8), Prediction("No tumor", 0.2)],
            final_finding="Meningioma",
            impression="Extra-axial mass.\n<font size=90>Follow up</font> in 6 weeks.",
            clinician_name="Dr. Rao",
            clinician_title="Radiologist",
            scan=Image.new("RGB", (200, 120), "gray"),
            heatmap=Image.new("RGB", (200, 120), "red"),
            scan_sha256="0" * 64,
            verify_url="http://localhost:3000/verify?record=0xabc",
        )
    )
    assert pdf.startswith(b"%PDF")
