"""Create the demo workspace: an organization, sites, staff, patients and a month of studies.

    python -m app.seed

Requires the local chain, the deployed registry and storage (see the Makefile). It only runs on
an empty database; use `make fresh` to start over. When the local chain was started in the past
(`make chain` does this), each historical report is anchored on-chain at the time it was signed.
"""

import asyncio
import hashlib
import logging
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from PIL import Image
from sqlalchemy import func, select

from app import labs, workflows
from app.config import HARDHAT_DEV_KEY, LOCAL_CHAIN_ID, Settings
from app.db import init_db
from app.demo import (
    CENTRE,
    DEMO_ORG,
    DEMO_PASSWORD,
    DEMO_SITES,
    DEMO_STAFF,
    EXTERNAL_REFERRERS,
    MAIN,
    PARTNER,
    PRIYA,
    SAMPLES_DIR,
    STORY_AGES,
    WALK_IN_NAMES,
)
from app.imaging import decode_scan
from app.ml.engine import Engine, Inference
from app.models import Organization, Priority, Sex, Site, Study, User
from app.services import Services, build_services

HISTORY_DAYS = 30

log = logging.getLogger("seed")

# Sample images by analysis and true label. The last two entries are images the model gets
# wrong, used occasionally so the demo shows radiologists overriding the AI.
IMAGES = {
    ("chest_xray", "Normal"): [
        "chest-xray-normal.png",
        "chest-xray-normal-2.png",
        "chest-xray-normal-3.png",
        "chest-xray-normal-4.png",
    ],
    ("chest_xray", "Pneumonia"): [
        "chest-xray-pneumonia.png",
        "chest-xray-pneumonia-2.png",
        "chest-xray-pneumonia-3.png",
        "chest-xray-pneumonia-4.png",
    ],
    ("brain_tumor", "No tumor"): ["brain-mri-no-tumor.jpg", "brain-mri-no-tumor-2.jpg"],
    ("brain_tumor", "Glioma"): [
        "brain-mri-glioma.jpg",
        "brain-mri-glioma-2.jpg",
        "brain-mri-glioma-3.jpg",
    ],
    ("brain_tumor", "Meningioma"): ["brain-mri-meningioma-1.jpg", "brain-mri-meningioma-2.jpg"],
    ("brain_tumor", "Pituitary tumor"): ["brain-mri-pituitary-1.jpg", "brain-mri-pituitary-2.jpg"],
}
OVERRIDES = {
    ("chest_xray", "Normal"): "chest-xray-normal-5.png",
    ("brain_tumor", "Glioma"): "brain-mri-glioma-4.jpg",
}

INDICATIONS = {
    "chest_xray": [
        "Fever and productive cough for 5 days.",
        "Breathlessness on exertion. SpO2 94% on room air.",
        "Pre-operative evaluation.",
        "Chronic cough; smoker for 20 years.",
        "Follow-up after treatment for pneumonia.",
        "Chest pain and low-grade fever.",
    ],
    "brain_tumor": [
        "Headache and vomiting for two weeks.",
        "New-onset seizure.",
        "Progressive visual disturbance.",
        "Dizziness and imbalance.",
        "Follow-up of a known lesion.",
        "Persistent headache, worse in the morning.",
    ],
    "cbc": [
        "Fatigue and pallor for a month.",
        "Fever for three days.",
        "Annual health check.",
        "Pre-operative workup.",
        "Follow-up of iron-deficiency anaemia.",
        "Fever with body ache; rule out dengue.",
    ],
    "drug_screen": ["Pre-employment screening.", "Periodic workplace screening."],
}

REPORTS = {
    ("chest_xray", "Normal"): (
        "Lungs are clear bilaterally. No focal consolidation, pleural effusion or pneumothorax. "
        "Cardiac silhouette and mediastinum are within normal limits. Visualised bones are "
        "unremarkable.",
        "No acute cardiopulmonary abnormality.",
    ),
    ("chest_xray", "Pneumonia"): (
        "Patchy airspace opacities in the right lower zone with air bronchograms. No pleural "
        "effusion or pneumothorax. Cardiac size is normal.",
        "Right lower zone consolidation, consistent with pneumonia. Clinical correlation and a "
        "follow-up radiograph after treatment are advised.",
    ),
    ("brain_tumor", "No tumor"): (
        "No intra-axial or extra-axial mass lesion. Ventricles and sulci are normal for age. "
        "No midline shift or abnormal enhancement.",
        "No MRI evidence of a mass lesion.",
    ),
    ("brain_tumor", "Glioma"): (
        "Heterogeneously enhancing intra-axial lesion in the left cerebral hemisphere with "
        "surrounding vasogenic oedema and mild mass effect on the adjacent ventricle.",
        "Features suggestive of a glioma. Urgent neurosurgical and neuro-oncology referral "
        "recommended.",
    ),
    ("brain_tumor", "Meningioma"): (
        "Well-circumscribed, homogeneously enhancing extra-axial dural-based lesion with a dural "
        "tail. No significant perilesional oedema.",
        "Features consistent with a meningioma. Neurosurgical opinion advised.",
    ),
    ("brain_tumor", "Pituitary tumor"): (
        "Enhancing sellar and suprasellar lesion consistent with a pituitary macroadenoma, "
        "abutting the optic chiasm.",
        "Pituitary macroadenoma. Endocrinology and neurosurgical correlation advised.",
    ),
    ("cbc", "Normal"): (
        "Haemoglobin, red cell indices, total and differential leucocyte counts and platelet "
        "count are within reference intervals. Peripheral smear: normocytic normochromic red "
        "cells.",
        "Complete blood count within normal limits.",
    ),
    ("cbc", "Anaemia"): (
        "Haemoglobin and MCV are low. Peripheral smear: microcytic hypochromic red cells with "
        "anisocytosis. Leucocyte and platelet counts are within reference intervals.",
        "Microcytic hypochromic anaemia, suggestive of iron deficiency. Serum ferritin and iron "
        "studies advised.",
    ),
    ("cbc", "Leucocytosis"): (
        "Total leucocyte count is raised with neutrophilia. No immature cells on the smear. "
        "Haemoglobin and platelet count are within reference intervals.",
        "Neutrophilic leucocytosis, suggestive of an acute bacterial infection. Correlate "
        "clinically.",
    ),
    ("cbc", "Thrombocytopenia"): (
        "Platelet count is low; no platelet clumps on the smear. Red cell and leucocyte "
        "parameters are within reference intervals.",
        "Thrombocytopenia. Repeat the count and evaluate for viral fever (dengue NS1/IgM) as "
        "clinically indicated.",
    ),
    ("cbc", "Other abnormality"): (
        "Some parameters are outside their reference intervals (see flags); no single pattern "
        "on the smear.",
        "Minor haematological abnormalities. Correlate clinically and repeat if indicated.",
    ),
    ("drug_screen", "Negative"): (
        "All six analytes are below the screening cutoffs.",
        "Negative urine drug screen.",
    ),
    ("drug_screen", "Positive"): (
        "Cannabinoids (THC) reactive above the 50 ng/mL screening cutoff. Other analytes are "
        "below their cutoffs.",
        "Presumptive positive for cannabinoids. This is a screening result; confirm by GC-MS or "
        "LC-MS/MS before any employment decision.",
    ),
}

# Minutes from acquisition to sign-off: usual range, and the occasional miss of the target.
TURNAROUND = {
    Priority.STAT: ((12, 55), (65, 120), 0.06),
    Priority.URGENT: ((35, 220), (250, 420), 0.08),
    Priority.ROUTINE: ((60, 1300), (1450, 2100), 0.06),
}
# Laboratories turn results around faster than reporting rooms.
LAB_TURNAROUND = {
    Priority.STAT: ((15, 50), (62, 90), 0.05),
    Priority.URGENT: ((30, 150), (250, 330), 0.05),
    Priority.ROUTINE: ((90, 420), (1450, 1700), 0.03),
}
LAB_PANELS = {"cbc", "drug_screen"}


@dataclass
class PlannedStudy:
    patient: str
    site: str
    analysis: str
    truth: str
    image: str  # sample scan; empty for lab studies
    priority: Priority
    acquired: datetime
    indication: str
    reporter: str | None = None
    referrer: str | None = None  # staff key, or an outside doctor's name
    values: dict[str, float | str] | None = None  # lab results
    critical_values: bool = False  # a lab value past a critical limit
    reported: datetime | None = None
    critical: bool = False
    study_id: str | None = field(default=None, compare=False)


class CachedEngine:
    """Runs each sample image through the model once; the demo reuses a handful of images."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._cache: dict[tuple[str, str], Inference] = {}

    def preload(self) -> None:
        self._engine.preload()

    def predict(self, analysis_type: str, image: Image.Image) -> Inference:
        key = (analysis_type, hashlib.sha256(image.tobytes()).hexdigest())
        if key not in self._cache:
            self._cache[key] = self._engine.predict(analysis_type, image)
        return self._cache[key]


class DevChain:
    """Hardhat's development RPC methods, used to fund wallets and set block times."""

    def __init__(self, http: httpx.AsyncClient, url: str) -> None:
        self._http = http
        self._url = url

    async def _rpc(self, method: str, params: list[Any]) -> Any:
        response = await self._http.post(
            self._url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        )
        body = response.json()
        if "error" in body:
            raise RuntimeError(f"{method}: {body['error'].get('message')}")
        return body.get("result")

    async def latest_time(self) -> int:
        block = await self._rpc("eth_getBlockByNumber", ["latest", False])
        return int(block["timestamp"], 16)

    async def fund(self, addresses: list[str]) -> None:
        for address in addresses:
            await self._rpc("hardhat_setBalance", [address, hex(100 * 10**18)])

    async def set_next_time(self, when: datetime) -> None:
        target = max(int(when.timestamp()), await self.latest_time() + 1)
        await self._rpc("evm_setNextBlockTimestamp", [target])

    async def catch_up(self, now: datetime) -> None:
        if await self.latest_time() < int(now.timestamp()):
            await self.set_next_time(now)
            await self._rpc("evm_mine", [])


def plan_studies(now: datetime, zone: ZoneInfo, rng: random.Random) -> list[PlannedStudy]:
    today = now.astimezone(zone).date()
    walk_ins = [name for name, _ in WALK_IN_NAMES]
    sexes = dict(WALK_IN_NAMES) | {PRIYA.name: PRIYA.sex}
    plans: list[PlannedStudy] = []

    def pick(options: dict[Any, float]) -> Any:
        return rng.choices(list(options), weights=list(options.values()))[0]

    def study_at(acquired: datetime, **fixed: Any) -> PlannedStudy:
        site = fixed.get("site") or pick({MAIN: 0.55, CENTRE: 0.3, PARTNER: 0.15})
        analysis = fixed.get("analysis") or pick({"chest_xray": 0.6, "brain_tumor": 0.4})
        truth = fixed.get("truth") or (
            pick({"Normal": 0.55, "Pneumonia": 0.45})
            if analysis == "chest_xray"
            else pick({"No tumor": 0.4, "Glioma": 0.25, "Meningioma": 0.2, "Pituitary tumor": 0.15})
        )
        override = OVERRIDES.get((analysis, truth))
        image = fixed.get("image") or (
            override if override and rng.random() < 0.06 else rng.choice(IMAGES[analysis, truth])
        )
        priority = fixed.get("priority") or pick(
            {Priority.ROUTINE: 0.7, Priority.URGENT: 0.2, Priority.STAT: 0.1}
        )
        if site == PARTNER:
            referrer = "Dr. S. Bansal (Lotus Clinic)"
        elif analysis == "chest_xray":
            referrer = pick({"arjun.mehta": 0.45, "sameer.khan": 0.25, "external": 0.3})
        else:
            referrer = pick({"kavita.nair": 0.55, "sameer.khan": 0.1, "external": 0.35})
        if referrer == "external":
            referrer = rng.choice([r for r in EXTERNAL_REFERRERS if "Lotus" not in r])
        return PlannedStudy(
            patient=fixed.get("patient") or rng.choice(walk_ins),
            site=site,
            analysis=analysis,
            truth=truth,
            image=image,
            priority=priority,
            acquired=acquired,
            indication=fixed.get("indication") or rng.choice(INDICATIONS[analysis]),
            referrer=fixed.get("referrer", referrer),
        )

    def lab_at(acquired: datetime, **fixed: Any) -> PlannedStudy:
        panel_id = fixed.get("analysis") or pick({"cbc": 0.8, "drug_screen": 0.2})
        patient = fixed.get("patient") or rng.choice(walk_ins)
        panel = labs.LAB_PANELS[panel_id]
        if panel_id == "cbc":
            pattern = pick(
                {"Normal": 0.5, "Anaemia": 0.25, "Leucocytosis": 0.15, "Thrombocytopenia": 0.1}
            )
            values = fixed.get("values") or _cbc_values(pattern, sexes[patient], rng)
            referrer = pick({"sameer.khan": 0.4, "arjun.mehta": 0.15, "external": 0.45})
            if referrer == "external":
                referrer = rng.choice([r for r in EXTERNAL_REFERRERS if "Lotus" not in r])
        else:
            positive = rng.random() < 0.12
            values = fixed.get("values") or {
                a.code: "positive" if positive and a.code == "thc" else "negative"
                for a in panel.analytes
            }
            referrer = "Pre-employment screening"
        results = labs.evaluate(panel, values, sexes[patient])
        return PlannedStudy(
            patient=patient,
            site=fixed.get("site") or pick({MAIN: 0.75, CENTRE: 0.25}),
            analysis=panel_id,
            truth=labs.suggest(panel, results),
            image="",
            priority=fixed.get("priority")
            or pick({Priority.ROUTINE: 0.75, Priority.URGENT: 0.15, Priority.STAT: 0.1}),
            acquired=acquired,
            indication=fixed.get("indication") or rng.choice(INDICATIONS[panel_id]),
            referrer=fixed.get("referrer", referrer),
            values=values,
            critical_values=labs.is_critical(results),
        )

    def report(plan: PlannedStudy, at: datetime | None = None) -> None:
        lab = plan.analysis in LAB_PANELS
        usual, late, late_share = (LAB_TURNAROUND if lab else TURNAROUND)[plan.priority]
        low, high = late if rng.random() < late_share else usual
        reported = at or plan.acquired + timedelta(minutes=rng.randint(low, high))
        if reported >= now - timedelta(minutes=5) and at is None and rng.random() < 0.7:
            # Most of this morning's work is already signed, as in a working department.
            reported = plan.acquired + (now - plan.acquired) * rng.uniform(0.3, 0.8)
        if reported >= now - timedelta(minutes=5):
            return  # still on the worklist
        plan.reported = reported
        if lab:
            plan.reporter = "farah.siddiqui"
            plan.critical = plan.critical_values
            return
        plan.reporter = (
            "vikram.iyer" if plan.site == PARTNER or rng.random() < 0.3 else "ananya.rao"
        )
        plan.critical = (plan.truth == "Glioma" and plan.priority is not Priority.ROUTINE) or (
            plan.truth == "Pneumonia" and plan.priority is Priority.STAT
        )

    def add(plan: PlannedStudy, acquired: datetime) -> None:
        if plan.priority is Priority.STAT:
            plan.acquired = acquired.replace(hour=rng.randint(0, 23))
            if plan.acquired > now - timedelta(hours=2):
                plan.acquired = acquired
        report(plan)
        plans.append(plan)

    # History: busier on weekdays, quieter on Sundays. Imaging, then the laboratory.
    for days_ago in range(HISTORY_DAYS, -1, -1):
        day = today - timedelta(days=days_ago)
        weekday = day.weekday() < 5
        imaging = rng.choice([4, 5, 6, 7]) if weekday else rng.choice([1, 2, 3])
        lab = rng.choice([2, 3, 4]) if weekday else rng.choice([1, 2])
        if days_ago == 0:
            imaging, lab = 4, 3
        for planner, count in ((study_at, imaging), (lab_at, lab)):
            for _ in range(count):
                hour = rng.randint(8, 19)
                acquired = datetime.combine(day, time(hour, rng.randint(0, 59)), zone)
                if acquired > now - timedelta(hours=2):
                    continue
                add(planner(acquired), acquired)

    # The portal patient's own history: a brain MRI and a chest X-ray, both reported.
    brain = study_at(
        now - timedelta(days=21, hours=3),
        patient=PRIYA.name,
        site=MAIN,
        analysis="brain_tumor",
        truth="Glioma",
        image="brain-mri-glioma.jpg",
        priority=Priority.URGENT,
        indication="Headache and vomiting for two weeks.",
        referrer="kavita.nair",
    )
    report(brain, brain.acquired + timedelta(minutes=96))
    chest = study_at(
        now - timedelta(days=9, hours=5),
        patient=PRIYA.name,
        site=MAIN,
        analysis="chest_xray",
        truth="Normal",
        image="chest-xray-normal.png",
        priority=Priority.ROUTINE,
        indication="Pre-operative evaluation.",
        referrer="arjun.mehta",
    )
    report(chest, chest.acquired + timedelta(hours=5, minutes=20))
    blood = lab_at(
        chest.acquired + timedelta(minutes=25),
        patient=PRIYA.name,
        site=MAIN,
        analysis="cbc",
        values=PRIYA_CBC,
        priority=Priority.ROUTINE,
        indication="Pre-operative workup.",
        referrer="arjun.mehta",
    )
    report(blood, blood.acquired + timedelta(hours=2, minutes=10))
    plans += [brain, chest, blood]

    # Today's worklist: waiting studies across all three sites, most urgent first.
    waiting = [
        dict(
            minutes=14,
            patient="Aman Gupta",
            site=MAIN,
            analysis="chest_xray",
            truth="Pneumonia",
            image="chest-xray-pneumonia.png",
            priority=Priority.STAT,
            indication="Acute breathlessness and fever. SpO2 89% on room air.",
            referrer="arjun.mehta",
        ),
        dict(
            minutes=52,
            patient="Meera Iyer",
            site=CENTRE,
            analysis="brain_tumor",
            truth="Glioma",
            image="brain-mri-glioma-2.jpg",
            priority=Priority.URGENT,
            indication="New-onset seizure.",
            referrer="kavita.nair",
        ),
        dict(
            minutes=38,
            patient="Rohit Bansal",
            site=PARTNER,
            analysis="chest_xray",
            truth="Normal",
            image="chest-xray-normal-5.png",
            priority=Priority.URGENT,
            indication="Cough for three weeks; rule out consolidation.",
            referrer="Dr. S. Bansal (Lotus Clinic)",
        ),
        dict(
            minutes=150,
            patient="Lakshmi Narayanan",
            site=MAIN,
            analysis="brain_tumor",
            truth="No tumor",
            image="brain-mri-no-tumor.jpg",
            priority=Priority.ROUTINE,
            indication="Dizziness and imbalance.",
            referrer="sameer.khan",
        ),
        dict(
            minutes=95,
            patient="Karan Mehra",
            site=CENTRE,
            analysis="chest_xray",
            truth="Normal",
            image="chest-xray-normal-3.png",
            priority=Priority.ROUTINE,
            indication="Pre-employment health check.",
            referrer="Dr. R. K. Singh (Singh Clinic)",
        ),
        dict(
            minutes=240,
            patient="Sunita Devi",
            site=PARTNER,
            analysis="brain_tumor",
            truth="Pituitary tumor",
            image="brain-mri-pituitary-2.jpg",
            priority=Priority.ROUTINE,
            indication="Progressive visual disturbance.",
            referrer="Dr. S. Bansal (Lotus Clinic)",
        ),
    ]
    for item in waiting:
        minutes = item.pop("minutes")
        plans.append(study_at(now - timedelta(minutes=minutes), **item))

    # The laboratory's queue: a critical blood count first, then a positive drug screen.
    waiting_lab = [
        dict(
            minutes=9,
            patient="Ramesh Chandra",
            site=MAIN,
            analysis="cbc",
            values=CRITICAL_CBC,
            priority=Priority.STAT,
            indication="Melaena and dizziness since morning. Pallor on examination.",
            referrer="sameer.khan",
        ),
        dict(
            minutes=45,
            patient="Nikhil Bhat",
            site=MAIN,
            analysis="drug_screen",
            values=THC_POSITIVE,
            priority=Priority.ROUTINE,
            indication="Pre-employment screening.",
            referrer="Pre-employment screening",
        ),
        dict(
            minutes=70,
            patient="Pooja Patel",
            site=CENTRE,
            analysis="cbc",
            values=ANAEMIA_CBC,
            priority=Priority.ROUTINE,
            indication="Fatigue and pallor for a month.",
            referrer="Dr. Neeta Batra (City Care Clinic)",
        ),
    ]
    for item in waiting_lab:
        minutes = item.pop("minutes")
        plans.append(lab_at(now - timedelta(minutes=minutes), **item))
    return plans


# Fixed results for the studies a demo walks through.
PRIYA_CBC = {
    "hb": 12.9,
    "rbc": 4.42,
    "hct": 39.1,
    "mcv": 88,
    "wbc": 7.2,
    "neut": 58,
    "lymph": 32,
    "plt": 268,
}
CRITICAL_CBC = {
    "hb": 6.1,
    "rbc": 2.48,
    "hct": 19.4,
    "mcv": 78,
    "wbc": 9.6,
    "neut": 68,
    "lymph": 26,
    "plt": 162,
}
ANAEMIA_CBC = {
    "hb": 10.4,
    "rbc": 3.96,
    "hct": 32.6,
    "mcv": 79,
    "wbc": 6.9,
    "neut": 57,
    "lymph": 33,
    "plt": 244,
}
THC_POSITIVE = {
    "amp": "negative",
    "mamp": "negative",
    "thc": "positive",
    "coc": "negative",
    "opi": "negative",
    "bzo": "negative",
}


def _cbc_values(pattern: str, sex: Sex, rng: random.Random) -> dict[str, float | str]:
    """A plausible blood count for one of the seeded patterns, rounded as the lab reports it."""
    female = sex is Sex.FEMALE
    u = rng.uniform
    values = {
        "hb": u(12.3, 14.6) if female else u(13.4, 16.4),
        "rbc": u(3.95, 4.7) if female else u(4.6, 5.4),
        "hct": u(37, 45) if female else u(41, 49),
        "mcv": u(85, 97),
        "wbc": u(4.8, 9.8),
        "neut": u(48, 66),
        "lymph": u(24, 34),
        "plt": u(170, 380),
    }
    if pattern == "Anaemia":
        values |= {
            "hb": u(8.2, 11.4) if female else u(8.6, 12.4),
            "rbc": u(3.2, 3.75) if female else u(3.6, 4.4),
            "hct": u(27, 35),
            "mcv": u(68, 80),
        }
    elif pattern == "Leucocytosis":
        values |= {"wbc": u(12.5, 19), "neut": u(78, 86), "lymph": u(10, 18)}
    elif pattern == "Thrombocytopenia":
        values |= {"plt": u(62, 135)}
    decimals = {a.code: a.decimals for a in labs.LAB_PANELS["cbc"].analytes}
    return {code: round(value, decimals[code]) for code, value in values.items()}


async def seed() -> None:
    settings = Settings()
    if settings.environment == "production" or settings.chain_id != LOCAL_CHAIN_ID:
        raise SystemExit("Seeding is only allowed against a local development chain.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as http:
        svc = build_services(settings, http)
        svc.ml = CachedEngine(svc.ml)
        await init_db(svc.db_engine)
        async with svc.db() as db:
            if await db.scalar(select(func.count()).select_from(Organization)):
                log.info("The workspace already exists. Run `make fresh` to start over.")
                return
            await _seed(svc, db, DevChain(http, settings.chain_rpc_url))
        await svc.db_engine.dispose()

    # The demo password is shown on the sign-in page; it is never written to logs.
    log.info("Done. Open %s and pick a demo role.", settings.public_app_url)


async def _seed(svc: Services, db: Any, chain: DevChain) -> None:
    rng = random.Random(2026)  # noqa: S311 (deterministic demo data, not security)
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    zone = ZoneInfo("Asia/Kolkata")
    plans = plan_studies(now, zone, rng)
    start = min(p.acquired for p in plans) - timedelta(days=2)
    travel = await chain.latest_time() < int(start.timestamp())
    if not travel:
        log.warning(
            "The chain clock is not in the past, so history is anchored at today's date. "
            "Restart the chain with `make chain` and run `make fresh` for matching dates."
        )
    else:
        await chain.set_next_time(start)

    org = await workflows.create_organization(db, **DEMO_ORG)
    sites: dict[str, Site] = {}
    for demo_site in DEMO_SITES:
        sites[demo_site.code] = await workflows.create_site(
            db,
            org_id=org.id,
            name=demo_site.name,
            code=demo_site.code,
            kind=demo_site.kind,
            city=demo_site.city,
        )
    await db.commit()

    staff: dict[str, User] = {}
    for member in DEMO_STAFF:
        staff[member.key] = await workflows.create_staff(
            svc,
            db,
            org_id=org.id,
            name=member.name,
            email=member.email,
            role=member.role,
            password=DEMO_PASSWORD,
            title=member.title,
            qualification=member.qualification,
            registration_number=member.registration,
            site_id=sites[member.site].id if member.site else None,
        )
    log.info("Created %s, %d sites and %d staff accounts", org.name, len(sites), len(staff))

    # Register each patient shortly before their first study.
    first_visit: dict[str, datetime] = {}
    for plan in sorted(plans, key=lambda p: p.acquired):
        first_visit.setdefault(plan.patient, plan.acquired)
    sexes = dict(WALK_IN_NAMES) | {PRIYA.name: PRIYA.sex}
    patients: dict[str, User] = {}
    for name, visit in sorted(first_visit.items(), key=lambda item: item[1]):
        portal = name == PRIYA.name
        patients[name] = await workflows.register_patient(
            svc,
            db,
            org=org,
            actor=staff["rahul.verma"],
            name=name,
            sex=sexes[name],
            date_of_birth=PRIYA.born if portal else _birth_date(rng, now, STORY_AGES.get(name)),
            phone=f"+91 9{rng.randint(100000000, 999999999)}",
            abha_number=_abha(rng) if portal or rng.random() < 0.45 else None,
            email=PRIYA.portal_email if portal else None,
            password=DEMO_PASSWORD if portal else None,
            registered_at=visit - timedelta(minutes=rng.randint(10, 40)),
        )
    await chain.fund(
        [u.wallet_address for u in [*staff.values(), *patients.values()] if u.wallet_address]
    )
    log.info("Registered %d patients", len(patients))

    # Replay the month in order, so accession numbers and on-chain times line up.
    technicians = {
        MAIN: staff["rahul.verma"],
        CENTRE: staff["sneha.patil"],
        PARTNER: staff["rahul.verma"],
    }
    lab_technologist = staff["imran.sheikh"]
    events: list[tuple[datetime, int, PlannedStudy]] = []
    for plan in plans:
        events.append((plan.acquired, 0, plan))
        if plan.reported:
            events.append((plan.reported, 1, plan))
    priya = patients[PRIYA.name]
    shared_at = min(
        p.reported for p in plans if p.patient == PRIYA.name and p.reported
    ) + timedelta(hours=2)
    shared = False
    for at, kind, plan in sorted(events, key=lambda e: (e[0], e[1])):
        if not shared and at > shared_at:
            if travel:
                await chain.set_next_time(shared_at)
            await workflows.grant_access(
                svc, db, patient=priya, clinician=staff["kavita.nair"], at=shared_at
            )
            shared = True
        if kind == 0 and plan.values is not None:
            referrer = staff.get(plan.referrer or "")
            study = await workflows.create_lab_study(
                svc,
                db,
                actor=lab_technologist,
                patient=patients[plan.patient],
                site=sites[plan.site],
                panel_id=plan.analysis,
                priority=plan.priority,
                values=plan.values,
                indication=plan.indication,
                referrer=referrer,
                referrer_name=None if referrer else plan.referrer,
                collected_at=plan.acquired,
            )
            plan.study_id = study.id
        elif kind == 0:
            referrer = staff.get(plan.referrer or "")
            study = await workflows.create_study(
                svc,
                db,
                actor=technicians[plan.site],
                patient=patients[plan.patient],
                site=sites[plan.site],
                analysis_type=plan.analysis,
                priority=plan.priority,
                scan=decode_scan((SAMPLES_DIR / plan.image).read_bytes()),
                indication=plan.indication,
                referrer=referrer,
                referrer_name=None if referrer else plan.referrer,
                acquired_at=plan.acquired,
            )
            plan.study_id = study.id
        else:
            if travel:
                await chain.set_next_time(at)
            study = await db.get(Study, plan.study_id)
            findings, impression = REPORTS[plan.analysis, plan.truth]
            await workflows.publish_study(
                svc,
                db,
                study=study,
                reporter=staff[plan.reporter or "ananya.rao"],
                final_finding=plan.truth,
                findings=findings,
                impression=impression,
                critical=plan.critical,
                published_at=at,
            )
    if travel:
        await chain.catch_up(datetime.now(UTC))
    reported = sum(1 for p in plans if p.reported)
    log.info(
        "Created %d studies: %d reported, %d on the worklist",
        len(plans),
        reported,
        len(plans) - reported,
    )


def _birth_date(rng: random.Random, now: datetime, age: int | None = None):
    days = rng.randint(18 * 365, 82 * 365)  # drawn either way, so the rest of the seed is unchanged
    if age is not None:
        days = age * 365 + days % 300
    return (now - timedelta(days=days)).date()


def _abha(rng: random.Random) -> str:
    digits = f"{rng.randint(10**13, 10**14 - 1)}"
    return f"{digits[:2]}-{digits[2:6]}-{digits[6:10]}-{digits[10:]}"


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for noisy in ("httpx", "httpx2", "huggingface_hub", "transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if Settings().operator_private_key.get_secret_value().lower() != HARDHAT_DEV_KEY:
        logging.getLogger("seed").warning("Operator is not the Hardhat dev key; gas will be real.")
    asyncio.run(seed())
