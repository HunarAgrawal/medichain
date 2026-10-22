"""Demo accounts for local development (DEMO_MODE=true). Never enabled in production."""

from dataclasses import dataclass
from datetime import date

from app.models import Role

DEMO_PASSWORD = "medichain-demo"  # noqa: S105 (public by design; demo mode only)


@dataclass(frozen=True)
class DemoUser:
    role: Role
    name: str
    email: str
    title: str | None
    date_of_birth: date | None
    description: str


DEMO_USERS = [
    DemoUser(
        Role.CLINICIAN,
        "Dr. Ananya Rao",
        "ananya.rao@medichain.example",
        "Consultant radiologist",
        None,
        "Runs AI-assisted studies, then reviews and signs the reports.",
    ),
    DemoUser(
        Role.PATIENT,
        "Priya Sharma",
        "priya.sharma@medichain.example",
        None,
        date(1979, 3, 14),
        "Owns her records and decides which clinicians can open them.",
    ),
    DemoUser(
        Role.CLINICIAN,
        "Dr. Daniel Chen",
        "daniel.chen@medichain.example",
        "Pulmonologist",
        None,
        "Sees a patient's records only after the patient shares them.",
    ),
    DemoUser(
        Role.PATIENT,
        "Tomás Okafor",
        "tomas.okafor@medichain.example",
        None,
        date(1964, 11, 2),
        "A second patient, for testing access boundaries.",
    ),
    DemoUser(
        Role.ADMIN,
        "Morgan Ellis",
        "admin@medichain.example",
        "Platform administrator",
        None,
        "Manages accounts, verifies clinicians and reviews the audit log.",
    ),
]
