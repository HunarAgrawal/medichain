/** Typed client for the Medichain API. Field names mirror the API (snake_case). */

const BASE = "/api/v1";

export type Role = "admin" | "radiologist" | "pathologist" | "technician" | "doctor" | "patient";
export type StaffRole = Exclude<Role, "patient">;
export type OrgKind = "hospital" | "imaging_centre" | "teleradiology";
export type SiteKind = "radiology_department" | "imaging_centre" | "partner";
export type Sex = "F" | "M" | "O";
export type Priority = "routine" | "urgent" | "stat";
export type Discipline = "radiology" | "laboratory";
export type StudyTypeId = "brain_tumor" | "chest_xray" | "cbc" | "drug_screen";
export type LabPanelId = Extract<StudyTypeId, "cbc" | "drug_screen">;
/** "" normal, L/H outside the reference interval, LL/HH past a critical limit, POS reactive. */
export type LabFlag = "" | "L" | "H" | "LL" | "HH" | "POS";
export type StudyStatus = "draft" | "published";
export type FileKind = "scan" | "report" | "heatmap";

export interface OrgSummary {
  id: string;
  name: string;
  short_name: string;
  kind: OrgKind;
  city: string | null;
}

export interface Organization extends OrgSummary {
  department: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  accreditation: string | null;
  uhid_prefix: string;
  timezone: string;
}

export interface Site {
  id: string;
  name: string;
  code: string;
  kind: SiteKind;
  city: string | null;
  is_active: boolean;
}

export interface SiteRef {
  id: string;
  name: string;
  code: string;
}

export interface UserSummary {
  id: string;
  name: string;
  role: Role;
  title: string | null;
  reference: string;
}

export interface User extends UserSummary {
  email: string | null;
  phone: string | null;
  qualification: string | null;
  registration_number: string | null;
  site: Site | null;
  wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  organization: OrgSummary;
}

export interface PatientSummary {
  id: string;
  name: string;
  uhid: string;
  sex: Sex | null;
  age: number | null;
}

export interface Patient extends PatientSummary {
  date_of_birth: string | null;
  phone: string | null;
  abha_number: string | null;
  email: string | null;
  portal_access: boolean;
  created_at: string;
  studies: number;
  last_study_at: string | null;
}

export interface NewPatient {
  name: string;
  sex: Sex;
  date_of_birth: string;
  phone?: string;
  abha_number?: string;
}

export interface Analyte {
  code: string;
  name: string;
  unit: string;
  kind: "number" | "screen";
  /** Reference interval by sex ("F", "M"), or "*" when the same for everyone. */
  reference: Record<string, [number, number]>;
  critical_low: number | null;
  critical_high: number | null;
  decimals: number;
  cutoff: string | null;
}

export interface StudyType {
  id: StudyTypeId;
  name: string;
  modality: string;
  discipline: Discipline;
  description: string;
  labels: string[];
  /** True when an AI model pre-reads the study; lab panels are flagged by reference intervals. */
  ai: boolean;
  analytes: Analyte[];
}

export interface DemoPersona {
  role: Role;
  label: string;
  name: string;
  email: string;
  title: string | null;
  description: string;
}

export interface Meta {
  study_types: StudyType[];
  max_upload_mb: number;
  tat_targets_minutes: Record<Priority, number>;
  chain: { chain_id: number; contract_address: string; explorer_url: string | null };
  demo: { password: string; workspace: OrgSummary | null; personas: DemoPersona[] } | null;
}

export interface Prediction {
  label: string;
  score: number;
}

export interface RecordInfo {
  record_id: string;
  tx_hash: string;
  scan_cid: string;
  report_cid: string;
  report_sha256: string;
  scan_sha256: string;
}

export interface StudySummary {
  id: string;
  accession: string;
  status: StudyStatus;
  priority: Priority;
  analysis_type: StudyTypeId;
  discipline: Discipline;
  analysis_name: string;
  modality: string;
  patient: PatientSummary;
  site: SiteRef;
  referred_by: string | null;
  /** The radiologist or pathologist who signed the report. */
  reporter: UserSummary | null;
  top_finding: string | null;
  critical: boolean;
  created_at: string;
  published_at: string | null;
  turnaround_minutes: number | null;
}

export interface StudyDetail extends StudySummary {
  access: "full" | "status";
  indication: string | null;
  created_by: UserSummary;
  referrer: UserSummary | null;
  model_id: string | null;
  predictions: Prediction[];
  final_finding: string | null;
  findings: string | null;
  impression: string | null;
  ai_agrees: boolean | null;
  has_heatmap: boolean;
  results: LabResult[];
  record: RecordInfo | null;
}

export interface LabResult {
  code: string;
  name: string;
  value: number | string;
  /** The value as printed on the report. */
  text: string;
  unit: string;
  reference: string;
  flag: LabFlag;
}

export interface StudyQuery {
  status?: StudyStatus;
  priority?: Priority;
  site_id?: string;
  patient_id?: string;
  critical?: boolean;
  since?: string;
  q?: string;
  order?: "recent" | "worklist";
  limit?: number;
}

export interface NewStudy {
  patient_id: string;
  analysis_type: StudyTypeId;
  priority: Priority;
  site_id?: string;
  indication?: string;
  referrer_id?: string;
  referrer_name?: string;
  file: File;
}

export interface NewLabStudy {
  patient_id: string;
  panel: LabPanelId;
  priority: Priority;
  site_id?: string;
  indication?: string;
  referrer_id?: string;
  referrer_name?: string;
  /** Numbers for measured analytes, "negative" or "positive" for screens. */
  values: Record<string, number | string>;
}

export interface Report {
  final_finding: string;
  findings?: string;
  impression: string;
  critical: boolean;
}

export interface CareTeamMember {
  clinician: UserSummary;
  active: boolean;
}

export interface AuditEvent {
  id: number;
  at: string;
  action: string;
  actor: UserSummary | null;
  target: UserSummary | null;
  study_id: string | null;
  detail: string | null;
  tx_hash: string | null;
}

export interface ServiceCheck {
  ok: boolean;
  detail: string;
}

export interface Dashboard {
  period_days: number;
  kpis: {
    studies_today: number;
    reported_today: number;
    awaiting_report: number;
    stat_waiting: number;
    median_tat_minutes: number | null;
    within_target_pct: number | null;
    ai_agreement_pct: number | null;
    critical_findings: number;
    studies_in_period: number;
  };
  daily: { day: string; by_discipline: Record<string, number>; reported: number }[];
  tat_by_priority: {
    priority: Priority;
    reported: number;
    median_minutes: number | null;
    target_minutes: number;
    within_target_pct: number | null;
  }[];
  sites: { site: SiteRef; studies: number; awaiting: number; median_tat_minutes: number | null }[];
  reporters: { reporter: UserSummary; reports: number; median_tat_minutes: number | null }[];
  staff: Record<StaffRole, number>;
  patients: number;
  services: Record<string, ServiceCheck>;
}

export interface NewStaff {
  name: string;
  email: string;
  role: StaffRole;
  title?: string;
  qualification?: string;
  registration_number?: string;
  site_id?: string;
  phone?: string;
  password?: string;
}

export type OrganizationUpdate = Partial<
  Pick<
    Organization,
    | "name"
    | "short_name"
    | "kind"
    | "department"
    | "address"
    | "city"
    | "phone"
    | "email"
    | "accreditation"
  >
>;

export interface NewSite {
  name: string;
  code: string;
  kind: SiteKind;
  city?: string;
}

export interface DemoSamples {
  attribution: string;
  samples: { file: string; analysis_type: StudyTypeId; label: string }[];
}

export interface VerifyResult {
  authentic: boolean;
  report_sha256: string;
  record_id: string | null;
  published_at: string | null;
  issuer: {
    name: string;
    title: string | null;
    qualification: string | null;
    registration_number: string | null;
    organization: string | null;
  } | null;
  analysis_name: string | null;
  accession: string | null;
  matches_expected_record: boolean | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      // Required by the API on state-changing requests (CSRF defence).
      headers: { "X-Requested-With": "XMLHttpRequest", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "Cannot reach Medichain. Check your connection and try again.");
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { loc?: unknown[]; msg?: string };
      const field = first.loc?.at(-1);
      const message = (first.msg ?? "Invalid input").replace(/^Value error, /, "");
      return typeof field === "string" ? `${field.replaceAll("_", " ")}: ${message}` : message;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `Request failed (${response.status}).`;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const query = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

const id = encodeURIComponent;

/** URL of a study file. Same-origin, so the session cookie authorizes it in <img> and links. */
export const fileUrl = (studyId: string, kind: FileKind) =>
  `${BASE}/studies/${id(studyId)}/files/${kind}`;

export const api = {
  meta: () => request<Meta>("/meta"),

  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) =>
    request<User>("/auth/login", json("POST", { email, password })),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  changePassword: (current_password: string, new_password: string) =>
    request<User>("/auth/password", json("POST", { current_password, new_password })),

  patients: (q = "", limit = 25) => request<Patient[]>(`/patients${query({ q, limit })}`),
  patient: (patientId: string) => request<Patient>(`/patients/${id(patientId)}`),
  registerPatient: (body: NewPatient) => request<Patient>("/patients", json("POST", body)),
  enablePortal: (patientId: string, email: string) =>
    request<{ patient: Patient; temporary_password: string }>(
      `/patients/${id(patientId)}/portal`,
      json("POST", { email }),
    ),

  studies: (params: StudyQuery = {}) => request<StudySummary[]>(`/studies${query({ ...params })}`),
  study: (studyId: string) => request<StudyDetail>(`/studies/${id(studyId)}`),
  createStudy: ({ file, ...fields }: NewStudy) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value) form.append(key, value);
    }
    form.append("file", file);
    return request<StudyDetail>("/studies", { method: "POST", body: form });
  },
  createLabStudy: (body: NewLabStudy) => request<StudyDetail>("/studies/lab", json("POST", body)),
  publishStudy: (studyId: string, report: Report) =>
    request<StudyDetail>(`/studies/${id(studyId)}/publish`, json("POST", report)),
  discardStudy: (studyId: string) => request<void>(`/studies/${id(studyId)}`, { method: "DELETE" }),
  studyActivity: (studyId: string) => request<AuditEvent[]>(`/studies/${id(studyId)}/activity`),

  careTeam: () => request<CareTeamMember[]>("/sharing"),
  share: (clinician_id: string) =>
    request<CareTeamMember[]>("/sharing", json("POST", { clinician_id })),
  unshare: (clinicianId: string) =>
    request<void>(`/sharing/${id(clinicianId)}`, { method: "DELETE" }),
  clinicians: (params: { q?: string; role?: "doctor" | "radiologist" } = {}) =>
    request<UserSummary[]>(`/directory/clinicians${query(params)}`),
  sites: () => request<Site[]>("/sites"),
  activity: () => request<AuditEvent[]>("/activity"),

  dashboard: (days = 30) => request<Dashboard>(`/admin/dashboard${query({ days })}`),
  staff: (params: { role?: StaffRole; q?: string } = {}) =>
    request<User[]>(`/admin/users${query(params)}`),
  createStaff: (body: NewStaff) =>
    request<{ user: User; temporary_password: string | null }>("/admin/users", json("POST", body)),
  setUserActive: (userId: string, is_active: boolean) =>
    request<User>(`/admin/users/${id(userId)}`, json("PATCH", { is_active })),
  organization: () => request<Organization>("/admin/organization"),
  updateOrganization: (body: OrganizationUpdate) =>
    request<Organization>("/admin/organization", json("PATCH", body)),
  adminSites: () => request<Site[]>("/admin/sites"),
  createSite: (body: NewSite) => request<Site>("/admin/sites", json("POST", body)),
  auditLog: (params: { action?: string; limit?: number; offset?: number } = {}) =>
    request<AuditEvent[]>(`/admin/audit${query(params)}`),

  demoSamples: () => request<DemoSamples>("/demo/samples"),
  /** Download a demo sample scan as a File, ready for the scan picker. */
  demoSampleFile: async (name: string): Promise<File> => {
    const response = await fetch(`${BASE}/demo/samples/${id(name)}`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type });
  },

  verify: (file: File, recordId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (recordId) form.append("record_id", recordId);
    return request<VerifyResult>("/verify", { method: "POST", body: form });
  },
};
