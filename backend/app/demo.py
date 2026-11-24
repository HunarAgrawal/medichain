"""The demo workspace (DEMO_MODE=true). Never enabled in production.

A fictional Indian hospital with an in-house radiology department and laboratory, a standalone
imaging centre and a partner clinic whose studies are reported remotely, so a single workspace
shows Medichain for hospitals, imaging centres, teleradiology and pathology labs alike. All names
and numbers are invented.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from app.models import OrgKind, Role, Sex, SiteKind

DEMO_PASSWORD = "medichain-demo"  # noqa: S105 (public by design; demo mode only)
DEMO_DOMAIN = "arogya.example"

DEMO_ORG = {
    "name": "Arogya Multispeciality Hospital",
    "short_name": "Arogya Hospital",
    "kind": OrgKind.HOSPITAL,
    "department": "Department of Radiology & Imaging",
    "address": "12 Health City Road, Sector 62",
    "city": "Noida",
    "phone": "+91 120 400 7000",
    "email": f"radiology@{DEMO_DOMAIN}",
    "accreditation": "Demo workspace · fictional hospital",
    "uhid_prefix": "AMH",
}


@dataclass(frozen=True)
class DemoSite:
    code: str
    name: str
    kind: SiteKind
    city: str


MAIN, CENTRE, PARTNER = "MAIN", "S18", "LOTUS"

DEMO_SITES = [
    DemoSite(MAIN, "Main campus", SiteKind.RADIOLOGY_DEPARTMENT, "Noida"),
    DemoSite(CENTRE, "Arogya Diagnostics, Sector 18", SiteKind.IMAGING_CENTRE, "Noida"),
    DemoSite(PARTNER, "Lotus Clinic (partner)", SiteKind.PARTNER, "Ghaziabad"),
]


@dataclass(frozen=True)
class DemoStaff:
    key: str
    role: Role
    name: str
    title: str
    site: str | None = None
    qualification: str | None = None
    registration: str | None = None
    # Shown on the sign-in page when set: a short role label and one line about the job.
    label: str | None = None
    persona: str | None = None

    @property
    def email(self) -> str:
        return f"{self.key}@{DEMO_DOMAIN}"


DEMO_STAFF = [
    DemoStaff(
        "rahul.verma",
        Role.TECHNICIAN,
        "Rahul Verma",
        "Radiographer",
        site=MAIN,
        label="Radiographer",
        persona="Registers patients, acquires scans and sends them for reporting.",
    ),
    DemoStaff(
        "ananya.rao",
        Role.RADIOLOGIST,
        "Dr. Ananya Rao",
        "Consultant Radiologist",
        site=MAIN,
        qualification="MD (Radiodiagnosis)",
        registration="UPMC-DEMO-21458",
        label="Radiologist",
        persona="Reports scans with an AI pre-read and signs the report.",
    ),
    DemoStaff(
        "vikram.iyer",
        Role.RADIOLOGIST,
        "Dr. Vikram Iyer",
        "Consultant Radiologist · Teleradiology",
        qualification="DNB (Radiodiagnosis)",
        registration="KMC-DEMO-77310",
        label="Teleradiologist",
        persona="Reports studies from the partner clinic remotely.",
    ),
    DemoStaff(
        "imran.sheikh",
        Role.TECHNICIAN,
        "Imran Sheikh",
        "Lab technologist",
        site=MAIN,
        label="Lab technologist",
        persona="Enters blood and drug test results; abnormal values flag themselves.",
    ),
    DemoStaff(
        "farah.siddiqui",
        Role.PATHOLOGIST,
        "Dr. Farah Siddiqui",
        "Consultant Pathologist",
        site=MAIN,
        qualification="MD (Pathology)",
        registration="UPMC-DEMO-61237",
        label="Pathologist",
        persona="Verifies flagged lab results and signs the lab report.",
    ),
    DemoStaff(
        "arjun.mehta",
        Role.DOCTOR,
        "Dr. Arjun Mehta",
        "Pulmonologist",
        qualification="MD (Pulmonary Medicine)",
        registration="DMC-DEMO-40122",
        label="Referring doctor",
        persona="Refers patients and gets their reports the moment they are signed.",
    ),
    DemoStaff(
        "neha.kapoor",
        Role.ADMIN,
        "Neha Kapoor",
        "Hospital administrator",
        label="Admin",
        persona="Runs the workspace: dashboard, staff, sites and the audit log.",
    ),
    DemoStaff(
        "sneha.patil",
        Role.TECHNICIAN,
        "Sneha Patil",
        "Radiographer",
        site=CENTRE,
    ),
    DemoStaff(
        "kavita.nair",
        Role.DOCTOR,
        "Dr. Kavita Nair",
        "Neurologist",
        qualification="DM (Neurology)",
        registration="UPMC-DEMO-30981",
    ),
    DemoStaff(
        "sameer.khan",
        Role.DOCTOR,
        "Dr. Sameer Khan",
        "General Physician",
        qualification="MBBS, MD (Medicine)",
        registration="UPMC-DEMO-55204",
    ),
]

PATIENT_PERSONA = "Reads her reports, shares them with doctors and sees who opened them."


@dataclass(frozen=True)
class DemoPatient:
    name: str
    sex: Sex
    born: date
    portal_email: str | None = None


# The portal patient comes first; the rest are walk-ins without portal access.
PRIYA = DemoPatient("Priya Sharma", Sex.FEMALE, date(1979, 3, 14), f"priya.sharma@{DEMO_DOMAIN}")

_FEMALE = (
    "Meera Iyer|Kavya Reddy|Sunita Devi|Fatima Shaikh|Pooja Patel|Lakshmi Narayanan|Neelam Gupta|"
    "Ritu Chauhan|Sana Qureshi|Harpreet Kaur|Anjali Menon|Shalini Joshi|Geeta Yadav|Tanvi Desai|"
    "Rekha Pillai|Bhavna Shah|Nisha Thomas|Deepa Kulkarni|Swati Agarwal"
)
_MALE = (
    "Aman Gupta|Rajesh Kumar|Mohammed Irfan|Suresh Babu|Vivek Malhotra|Arvind Nair|Karan Mehra|"
    "Sanjay Mishra|Rohit Bansal|Dinesh Patil|Gurpreet Singh|Prakash Hegde|Ajay Tiwari|Nikhil Bhat|"
    "Farhan Ali|Joseph D'Souza|Ramesh Chandra|Abhishek Saxena|Manoj Pandey|Harish Rawat"
)
WALK_IN_NAMES = [(n, Sex.FEMALE) for n in _FEMALE.split("|")] + [
    (n, Sex.MALE) for n in _MALE.split("|")
]

# Ages that fit each walkthrough patient's story; everyone else gets a random adult age.
STORY_AGES = {
    "Aman Gupta": 54,
    "Meera Iyer": 38,
    "Rohit Bansal": 41,
    "Lakshmi Narayanan": 62,
    "Karan Mehra": 24,
    "Sunita Devi": 47,
    "Ramesh Chandra": 63,
    "Nikhil Bhat": 26,
    "Pooja Patel": 29,
}

# Outside doctors who refer to the imaging centre and the partner clinic without an account.
EXTERNAL_REFERRERS = [
    "Dr. R. K. Singh (Singh Clinic)",
    "Dr. Neeta Batra (City Care Clinic)",
    "Dr. S. Bansal (Lotus Clinic)",
    "Dr. Alok Jain (Jain Polyclinic)",
]


SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"

# Scans offered on the new-study screen in demo mode: (file, analysis, label). CC BY 4.0, see
# samples/README.md for attribution.
DEMO_SAMPLES = [
    ("chest-xray-pneumonia-2.png", "chest_xray", "Pneumonia"),
    ("chest-xray-normal-2.png", "chest_xray", "Normal"),
    ("brain-mri-glioma-3.jpg", "brain_tumor", "Glioma"),
    ("brain-mri-meningioma-1.jpg", "brain_tumor", "Meningioma"),
    ("brain-mri-pituitary-1.jpg", "brain_tumor", "Pituitary tumor"),
    ("brain-mri-no-tumor-2.jpg", "brain_tumor", "No tumor"),
]
SAMPLE_ATTRIBUTION = (
    "Sample scans: Brain Tumor MRI Dataset (M. Nickparvar) and Chest X-Ray Images "
    "(Kermany, Zhang and Goldbaum), CC BY 4.0."
)
