import type { Discipline, OrgKind, Role, SiteKind } from "./api";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  radiologist: "Radiologist",
  pathologist: "Pathologist",
  technician: "Technician",
  doctor: "Referring doctor",
  patient: "Patient",
};

/** Where each role lands after signing in. */
export const HOME: Record<Role, string> = {
  technician: "/desk",
  radiologist: "/worklist",
  pathologist: "/worklist",
  doctor: "/reports",
  patient: "/records",
  admin: "/admin",
};

export const ORG_KIND_LABEL: Record<OrgKind, string> = {
  hospital: "Hospital",
  imaging_centre: "Imaging centre",
  teleradiology: "Teleradiology provider",
};

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  radiology_department: "Hospital department",
  imaging_centre: "Imaging centre",
  partner: "Partner site (remote reporting)",
};

/** Roles that report and sign studies, and the discipline each one reports. */
export const REPORTING_DISCIPLINE: Partial<Record<Role, Discipline>> = {
  radiologist: "radiology",
  pathologist: "laboratory",
};

export const isReporter = (role: Role) => role in REPORTING_DISCIPLINE;
