"""The analyses Medichain offers. Model IDs are configured in Settings."""

from dataclasses import dataclass, field
from typing import Literal

AnalysisTypeId = Literal["brain_tumor", "chest_xray"]


@dataclass(frozen=True)
class AnalysisType:
    id: AnalysisTypeId
    name: str
    modality: str
    description: str
    labels: dict[str, str] = field(default_factory=dict)


ANALYSIS_TYPES: dict[str, AnalysisType] = {
    "brain_tumor": AnalysisType(
        id="brain_tumor",
        name="Brain tumor screening",
        modality="MRI",
        description="Classifies glioma, meningioma, pituitary tumor or no tumor.",
        labels={
            "glioma": "Glioma",
            "meningioma": "Meningioma",
            "notumor": "No tumor",
            "pituitary": "Pituitary tumor",
        },
    ),
    "chest_xray": AnalysisType(
        id="chest_xray",
        name="Pneumonia screening",
        modality="Chest X-ray",
        description="Detects radiographic signs of pneumonia.",
        labels={"NORMAL": "Normal", "PNEUMONIA": "Pneumonia"},
    ),
}


def display_label(analysis_type: str, raw_label: str) -> str:
    known = ANALYSIS_TYPES[analysis_type].labels.get(raw_label)
    return known or raw_label.replace("_", " ").strip().capitalize()
