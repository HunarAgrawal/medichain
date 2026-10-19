import type { Role } from "./api";

export const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  clinician: "Clinician",
  admin: "Admin",
};
