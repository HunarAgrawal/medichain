import type { AnalysisTypeId } from "../../lib/api";

export const PATIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const ACCEPTED_SCAN_TYPES = ["image/png", "image/jpeg"];

export interface AnalysisDraft {
  analysisType: AnalysisTypeId;
  patientId: string;
  patientName: string;
  patientAge: string;
  file: File | null;
}

export type DraftField = "patientId" | "patientName" | "patientAge" | "file";
export type DraftErrors = Partial<Record<DraftField, string>>;

export function validateScan(file: File, maxUploadMb: number): string | undefined {
  if (!ACCEPTED_SCAN_TYPES.includes(file.type)) return "Choose a PNG or JPEG image.";
  if (file.size > maxUploadMb * 1024 * 1024) return `The file is larger than ${maxUploadMb} MB.`;
  return undefined;
}

export function validateDraft(draft: AnalysisDraft, maxUploadMb: number): DraftErrors {
  const errors: DraftErrors = {};

  if (!PATIENT_ID_PATTERN.test(draft.patientId.trim())) {
    errors.patientId = "Use 1–64 letters, numbers, hyphens or underscores.";
  }

  const name = draft.patientName.trim();
  if (!name) errors.patientName = "Enter the patient's name.";
  else if (name.length > 100) errors.patientName = "Use at most 100 characters.";

  const age = Number(draft.patientAge);
  if (draft.patientAge.trim() === "" || !Number.isInteger(age) || age < 0 || age > 130) {
    errors.patientAge = "Enter a whole number from 0 to 130.";
  }

  if (!draft.file) errors.file = "Choose a scan to analyze.";
  else {
    const fileError = validateScan(draft.file, maxUploadMb);
    if (fileError) errors.file = fileError;
  }

  return errors;
}
