"""Every report type Medichain offers, by discipline.

Imaging types run an AI pre-read (models in app/ml/catalog.py); laboratory panels are flagged
against reference intervals (app/labs.py). The rest of the platform (worklists, signing, delivery,
consent, verification, analytics) is the same for every type, so adding a modality or panel here
offers it everywhere.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from app.labs import LAB_PANELS
from app.ml.catalog import ANALYSIS_TYPES


class Discipline(StrEnum):
    RADIOLOGY = "radiology"
    LABORATORY = "laboratory"


DISCIPLINE_LABEL = {Discipline.RADIOLOGY: "Imaging", Discipline.LABORATORY: "Laboratory"}
# Printed under the organization's name; radiology uses the organization's own department name.
DEPARTMENT = {Discipline.LABORATORY: "Department of Laboratory Medicine"}

StudyTypeId = Literal["brain_tumor", "chest_xray", "cbc", "drug_screen"]
LabPanelId = Literal["cbc", "drug_screen"]


@dataclass(frozen=True)
class StudyType:
    id: str
    name: str
    modality: str
    discipline: Discipline
    description: str
    labels: tuple[str, ...]


STUDY_TYPES: dict[str, StudyType] = {
    **{
        t.id: StudyType(
            t.id, t.name, t.modality, Discipline.RADIOLOGY, t.description, tuple(t.labels.values())
        )
        for t in ANALYSIS_TYPES.values()
    },
    **{
        p.id: StudyType(p.id, p.name, p.modality, Discipline.LABORATORY, p.description, p.labels)
        for p in LAB_PANELS.values()
    },
}
