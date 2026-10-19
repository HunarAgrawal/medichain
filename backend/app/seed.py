"""Create demo accounts and sample studies on a local stack.

    python -m app.seed

Requires the local chain, the deployed registry and IPFS (see `make dev`). It is idempotent:
existing accounts are kept and sample studies are only created on an empty database.
"""

import asyncio
import logging
from pathlib import Path

import httpx
from sqlalchemy import func, select

from app import workflows
from app.config import HARDHAT_DEV_KEY, LOCAL_CHAIN_ID, Settings
from app.db import init_db
from app.demo import DEMO_PASSWORD, DEMO_USERS
from app.imaging import decode_scan
from app.models import Study, User
from app.services import build_services

SAMPLES = Path(__file__).resolve().parents[2] / "samples"

log = logging.getLogger("seed")

SAMPLE_STUDIES = [
    # (patient email, analysis, sample file, final finding, impression) — None = leave as draft
    (
        "priya.sharma@medichain.example",
        "brain_tumor",
        "brain-mri-glioma.jpg",
        "Glioma",
        "Heterogeneous enhancing intra-axial mass in the left cerebral hemisphere with "
        "surrounding signal change, in keeping with a glioma. Recommend neurosurgical and "
        "neuro-oncology referral with contrast-enhanced MRI for staging.",
    ),
    (
        "priya.sharma@medichain.example",
        "chest_xray",
        "chest-xray-normal.png",
        "Normal",
        "Lungs are clear. No focal consolidation, effusion or pneumothorax. Cardiomediastinal "
        "silhouette within normal limits.",
    ),
    ("tomas.okafor@medichain.example", "chest_xray", "chest-xray-pneumonia.png", None, None),
]


async def seed() -> None:
    settings = Settings()
    if settings.environment == "production" or settings.chain_id != LOCAL_CHAIN_ID:
        raise SystemExit("Seeding is only allowed against a local development chain.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as http:
        svc = build_services(settings, http)
        await init_db(svc.db_engine)
        async with svc.db() as db:
            users: dict[str, User] = {}
            for demo in DEMO_USERS:
                user = await db.scalar(select(User).where(User.email == demo.email))
                if user is None:
                    user = await workflows.create_user(
                        svc,
                        db,
                        name=demo.name,
                        email=demo.email,
                        role=demo.role,
                        password=DEMO_PASSWORD,
                        title=demo.title,
                        date_of_birth=demo.date_of_birth,
                    )
                    log.info("Created %s account %s", demo.role.value, demo.email)
                users[demo.email] = user

            if await db.scalar(select(func.count()).select_from(Study)):
                log.info("Studies already exist; skipping sample studies.")
                return

            rao = users["ananya.rao@medichain.example"]
            for patient_email, analysis, sample, finding, impression in SAMPLE_STUDIES:
                scan = decode_scan((SAMPLES / sample).read_bytes())
                study = await workflows.create_draft(
                    svc,
                    db,
                    clinician=rao,
                    patient=users[patient_email],
                    analysis_type=analysis,
                    scan=scan,
                )
                if finding and impression:
                    await workflows.publish_study(
                        svc,
                        db,
                        study=study,
                        clinician=rao,
                        final_finding=finding,
                        impression=impression,
                    )
                log.info(
                    "Created %s %s study for %s",
                    "published" if finding else "draft",
                    analysis,
                    patient_email,
                )

            priya = users["priya.sharma@medichain.example"]
            chen = users["daniel.chen@medichain.example"]
            await workflows.grant_access(svc, db, patient=priya, clinician=chen)
            log.info("Priya Sharma shared her records with Dr. Daniel Chen")

        await svc.db_engine.dispose()

    log.info(
        "Done. Sign in at %s with any demo account (password: %s).",
        settings.public_app_url,
        DEMO_PASSWORD,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for noisy in ("httpx", "httpx2", "huggingface_hub", "transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if Settings().operator_private_key.get_secret_value().lower() != HARDHAT_DEV_KEY:
        logging.getLogger("seed").warning("Operator is not the Hardhat dev key; gas will be real.")
    asyncio.run(seed())
