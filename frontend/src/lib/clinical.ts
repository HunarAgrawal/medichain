/** Shared clinical vocabulary: priorities, study states, turnaround and patient facts. */

import type { Priority, Sex, StudySummary } from "./api";

export const PRIORITIES: Priority[] = ["stat", "urgent", "routine"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  stat: "STAT",
  urgent: "Urgent",
  routine: "Routine",
};

/** Default turnaround targets; the API's /meta is the source of truth when loaded. */
export const DEFAULT_TARGET_MINUTES: Record<Priority, number> = {
  stat: 60,
  urgent: 240,
  routine: 1440,
};

export const SEX_LABEL: Record<Sex, string> = { F: "Female", M: "Male", O: "Other" };

export function ageSex(patient: { age: number | null; sex: Sex | null }): string {
  const parts = [patient.age !== null ? `${patient.age} y` : null, patient.sex];
  return parts.filter(Boolean).join(" · ");
}

/** "45 min", "3 h 20 min", "2 d 4 h". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const rest = m % 60;
    return `${Math.floor(m / 60)} h${rest ? ` ${rest} min` : ""}`;
  }
  const hours = Math.floor((m % (24 * 60)) / 60);
  return `${Math.floor(m / (24 * 60))} d${hours ? ` ${hours} h` : ""}`;
}

export function minutesSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 60_000;
}

export type TatState = "ok" | "near" | "late";

/** How a turnaround compares with its target: within, in the last fifth, or over. */
export function tatState(minutes: number, target: number): TatState {
  if (minutes > target) return "late";
  return minutes > target * 0.8 ? "near" : "ok";
}

export function studyState(study: Pick<StudySummary, "status">): "Awaiting report" | "Reported" {
  return study.status === "draft" ? "Awaiting report" : "Reported";
}

/** "+919876543210" → "+91 98765 43210". Other formats are shown as stored. */
export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

/** Show only the last four digits of an ABHA number. */
export function maskAbha(abha: string | null): string {
  if (!abha) return "";
  const digits = abha.replaceAll("-", "");
  return `XX-XXXX-XXXX-${digits.slice(-4)}`;
}
