"""Laboratory panels: analytes, biological reference intervals, automatic flagging and a
suggested finding. Flags come from published reference intervals, not a model; a pathologist
verifies the results and signs every report.

Reference intervals vary by laboratory, method and population. These are typical adult values for
the demo; a laboratory replaces them with its own validated intervals.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


class Flag(StrEnum):
    NORMAL = ""
    LOW = "L"
    HIGH = "H"
    CRITICAL_LOW = "LL"
    CRITICAL_HIGH = "HH"
    POSITIVE = "POS"


LOW_FLAGS = frozenset({Flag.LOW, Flag.CRITICAL_LOW})
HIGH_FLAGS = frozenset({Flag.HIGH, Flag.CRITICAL_HIGH})
CRITICAL_FLAGS = frozenset({Flag.CRITICAL_LOW, Flag.CRITICAL_HIGH})
SCREEN_VALUES = ("negative", "positive")
# Cell-count units, written as escapes so the source has no look-alike characters. Only Latin-1
# characters, so the report's standard PDF font can print them.
THOUSANDS_PER_UL = "\u00d710\u00b3/\u00b5L"
MILLIONS_PER_UL = "million/\u00b5L"


@dataclass(frozen=True)
class Analyte:
    code: str
    name: str
    unit: str
    kind: Literal["number", "screen"] = "number"
    # Interval by sex ("F", "M"), or "*" when the same for everyone.
    reference: Mapping[str, tuple[float, float]] = field(default_factory=dict)
    critical_low: float | None = None
    critical_high: float | None = None
    # Values outside this range are typing errors, not results.
    plausible: tuple[float, float] = (0, 1_000_000)
    decimals: int = 1
    cutoff: str | None = None  # screening cutoff, for screen analytes

    def interval(self, sex: str | None) -> tuple[float, float]:
        if sex in self.reference:
            return self.reference[sex]
        if "*" in self.reference:
            return self.reference["*"]
        # Unknown or other sex: the union of the sex-specific intervals.
        lows, highs = zip(*self.reference.values(), strict=True)
        return min(lows), max(highs)


@dataclass(frozen=True)
class LabResult:
    code: str
    name: str
    value: float | str
    text: str  # the value as printed, with the analyte's decimals
    unit: str
    reference: str
    flag: Flag

    def as_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "name": self.name,
            "value": self.value,
            "text": self.text,
            "unit": self.unit,
            "reference": self.reference,
            "flag": self.flag.value,
        }


@dataclass(frozen=True)
class LabPanel:
    id: str
    name: str
    modality: str
    description: str
    analytes: tuple[Analyte, ...]
    labels: tuple[str, ...]
    suggest: Callable[[dict[str, LabResult]], str]


class LabValueError(ValueError):
    """A submitted value is missing, unknown or not a plausible result."""


def _number(value: float, decimals: int) -> str:
    return f"{value:.{decimals}f}"


def evaluate(panel: LabPanel, values: Mapping[str, object], sex: str | None) -> list[LabResult]:
    unknown = set(values) - {a.code for a in panel.analytes}
    if unknown:
        raise LabValueError(f"Unknown test codes: {', '.join(sorted(unknown))}")
    results = []
    for analyte in panel.analytes:
        if analyte.code not in values:
            raise LabValueError(f"Enter a result for {analyte.name}.")
        raw = values[analyte.code]
        if analyte.kind == "screen":
            value = str(raw).strip().lower()
            if value not in SCREEN_VALUES:
                raise LabValueError(f"{analyte.name} must be negative or positive.")
            flag = Flag.POSITIVE if value == "positive" else Flag.NORMAL
            results.append(
                LabResult(
                    analyte.code,
                    analyte.name,
                    value,
                    value.capitalize(),
                    analyte.unit,
                    f"Negative (cutoff {analyte.cutoff})",
                    flag,
                )
            )
            continue
        if isinstance(raw, bool) or not isinstance(raw, int | float):
            raise LabValueError(f"{analyte.name} must be a number.")
        number = round(float(raw), analyte.decimals)
        low_limit, high_limit = analyte.plausible
        if not low_limit <= number <= high_limit:
            raise LabValueError(
                f"{analyte.name} of {raw} {analyte.unit} is not a plausible result."
            )
        low, high = analyte.interval(sex)
        if analyte.critical_low is not None and number < analyte.critical_low:
            flag = Flag.CRITICAL_LOW
        elif analyte.critical_high is not None and number > analyte.critical_high:
            flag = Flag.CRITICAL_HIGH
        elif number < low:
            flag = Flag.LOW
        elif number > high:
            flag = Flag.HIGH
        else:
            flag = Flag.NORMAL
        reference = f"{_number(low, analyte.decimals)} - {_number(high, analyte.decimals)}"
        results.append(
            LabResult(
                analyte.code,
                analyte.name,
                number,
                _number(number, analyte.decimals),
                analyte.unit,
                reference,
                flag,
            )
        )
    return results


def is_critical(results: list[LabResult]) -> bool:
    return any(r.flag in CRITICAL_FLAGS for r in results)


def _suggest_cbc(results: dict[str, LabResult]) -> str:
    if results["hb"].flag in LOW_FLAGS:
        return "Anaemia"
    if results["wbc"].flag in HIGH_FLAGS:
        return "Leucocytosis"
    if results["plt"].flag in LOW_FLAGS:
        return "Thrombocytopenia"
    if any(r.flag is not Flag.NORMAL for r in results.values()):
        return "Other abnormality"
    return "Normal"


def _suggest_screen(results: dict[str, LabResult]) -> str:
    return "Positive" if any(r.flag is Flag.POSITIVE for r in results.values()) else "Negative"


def _screen(code: str, name: str, cutoff: str) -> Analyte:
    return Analyte(code, name, "", kind="screen", cutoff=cutoff)


LAB_PANELS: dict[str, LabPanel] = {
    "cbc": LabPanel(
        id="cbc",
        name="Complete blood count",
        modality="Blood test",
        description="Haemoglobin, cell counts and indices, flagged against reference intervals.",
        analytes=(
            Analyte(
                "hb",
                "Haemoglobin",
                "g/dL",
                reference={"F": (12.0, 15.0), "M": (13.0, 17.0)},
                critical_low=7.0,
                critical_high=20.0,
                plausible=(1, 25),
            ),
            Analyte(
                "rbc",
                "RBC count",
                MILLIONS_PER_UL,
                reference={"F": (3.8, 4.8), "M": (4.5, 5.5)},
                plausible=(0.5, 10),
                decimals=2,
            ),
            Analyte(
                "hct",
                "Haematocrit (PCV)",
                "%",
                reference={"F": (36.0, 46.0), "M": (40.0, 50.0)},
                plausible=(5, 75),
            ),
            Analyte(
                "mcv", "MCV", "fL", reference={"*": (83.0, 101.0)}, plausible=(40, 150), decimals=0
            ),
            Analyte(
                "wbc",
                "Total leucocyte count",
                THOUSANDS_PER_UL,
                reference={"*": (4.0, 11.0)},
                critical_low=2.0,
                critical_high=30.0,
                plausible=(0.1, 200),
            ),
            Analyte(
                "neut",
                "Neutrophils",
                "%",
                reference={"*": (40.0, 80.0)},
                plausible=(0, 100),
                decimals=0,
            ),
            Analyte(
                "lymph",
                "Lymphocytes",
                "%",
                reference={"*": (20.0, 40.0)},
                plausible=(0, 100),
                decimals=0,
            ),
            Analyte(
                "plt",
                "Platelet count",
                THOUSANDS_PER_UL,
                reference={"*": (150.0, 410.0)},
                critical_low=50.0,
                critical_high=1000.0,
                plausible=(1, 3000),
                decimals=0,
            ),
        ),
        labels=("Normal", "Anaemia", "Leucocytosis", "Thrombocytopenia", "Other abnormality"),
        suggest=_suggest_cbc,
    ),
    "drug_screen": LabPanel(
        id="drug_screen",
        name="Urine drug screen",
        modality="Drug test",
        description="Six-panel immunoassay screen, as used for pre-employment testing.",
        analytes=(
            _screen("amp", "Amphetamines", "1000 ng/mL"),
            _screen("mamp", "Methamphetamine", "1000 ng/mL"),
            _screen("thc", "Cannabinoids (THC)", "50 ng/mL"),
            _screen("coc", "Cocaine", "150 ng/mL"),
            _screen("opi", "Opiates", "2000 ng/mL"),
            _screen("bzo", "Benzodiazepines", "300 ng/mL"),
        ),
        labels=("Negative", "Positive"),
        suggest=_suggest_screen,
    ),
}


def suggest(panel: LabPanel, results: list[LabResult]) -> str:
    return panel.suggest({r.code: r for r in results})
