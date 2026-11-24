/**
 * Laboratory results: reference intervals and flags. The API flags every result when it is saved;
 * this mirrors its rules so the technologist sees flags while typing.
 */

import type { Analyte, LabFlag, LabPanelId, Sex } from "./api";

export const FLAG_LABEL: Record<LabFlag, string> = {
  "": "",
  L: "Low",
  H: "High",
  LL: "Critical low",
  HH: "Critical high",
  POS: "Positive",
};

export const isCriticalFlag = (flag: LabFlag) => flag === "LL" || flag === "HH";

/** The interval for the patient's sex; without one, the union of the sex-specific intervals. */
export function referenceInterval(analyte: Analyte, sex: Sex | null): [number, number] | null {
  const reference = analyte.reference;
  if (sex && reference[sex]) return reference[sex];
  if (reference["*"]) return reference["*"];
  const intervals = Object.values(reference);
  if (intervals.length === 0) return null;
  return [
    Math.min(...intervals.map(([low]) => low)),
    Math.max(...intervals.map(([, high]) => high)),
  ];
}

export function formatReference(analyte: Analyte, sex: Sex | null): string {
  if (analyte.kind === "screen") return `Negative (cutoff ${analyte.cutoff ?? ""})`;
  const interval = referenceInterval(analyte, sex);
  if (!interval) return "";
  return interval.map((limit) => limit.toFixed(analyte.decimals)).join(" - ");
}

/** The flag for an entered value, or null while the value is missing or not a number. */
export function flagFor(
  analyte: Analyte,
  raw: string | undefined,
  sex: Sex | null,
): LabFlag | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (analyte.kind === "screen") {
    if (text === "positive") return "POS";
    return text === "negative" ? "" : null;
  }
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const value = Number(parsed.toFixed(analyte.decimals));
  const interval = referenceInterval(analyte, sex);
  if (analyte.critical_low !== null && value < analyte.critical_low) return "LL";
  if (analyte.critical_high !== null && value > analyte.critical_high) return "HH";
  if (interval && value < interval[0]) return "L";
  if (interval && value > interval[1]) return "H";
  return "";
}

/** Entered values as the API expects them: numbers for measurements, words for screens. */
export function labValues(
  analytes: Analyte[],
  entered: Record<string, string>,
): Record<string, number | string> {
  return Object.fromEntries(
    analytes.map((a) => {
      const raw = (entered[a.code] ?? "").trim();
      return [a.code, a.kind === "screen" ? raw.toLowerCase() : Number(raw)];
    }),
  );
}

/** Ready-made results for demos, so a pitch does not depend on typing eight numbers. */
export const LAB_PRESETS: Record<LabPanelId, { label: string; values: Record<string, string> }[]> =
  {
    cbc: [
      {
        label: "Normal",
        values: {
          hb: "13.4",
          rbc: "4.52",
          hct: "40.6",
          mcv: "90",
          wbc: "7.4",
          neut: "60",
          lymph: "31",
          plt: "262",
        },
      },
      {
        label: "Iron-deficiency anaemia",
        values: {
          hb: "9.6",
          rbc: "3.71",
          hct: "30.2",
          mcv: "72",
          wbc: "6.8",
          neut: "58",
          lymph: "33",
          plt: "318",
        },
      },
      {
        label: "Dengue-like (low platelets)",
        values: {
          hb: "13.9",
          rbc: "4.71",
          hct: "42.8",
          mcv: "91",
          wbc: "3.4",
          neut: "44",
          lymph: "46",
          plt: "68",
        },
      },
      {
        label: "Critical haemoglobin",
        values: {
          hb: "6.3",
          rbc: "2.51",
          hct: "19.8",
          mcv: "79",
          wbc: "9.4",
          neut: "66",
          lymph: "27",
          plt: "171",
        },
      },
    ],
    drug_screen: [
      {
        label: "All negative",
        values: {
          amp: "negative",
          mamp: "negative",
          thc: "negative",
          coc: "negative",
          opi: "negative",
          bzo: "negative",
        },
      },
      {
        label: "Cannabinoids positive",
        values: {
          amp: "negative",
          mamp: "negative",
          thc: "positive",
          coc: "negative",
          opi: "negative",
          bzo: "negative",
        },
      },
    ],
  };
