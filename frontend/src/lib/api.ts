/** Typed client for the Medichain API. Field names mirror the API (snake_case). */

const BASE = "/api/v1";

export type Role = "patient" | "clinician" | "admin";
export type AnalysisTypeId = "brain_tumor" | "chest_xray";
export type StudyStatus = "draft" | "published";
export type FileKind = "scan" | "report" | "heatmap";

export interface UserSummary {
  id: string;
  name: string;
  role: Role;
  title: string | null;
  reference: string;
}

export interface User extends UserSummary {
  email: string;
  date_of_birth: string | null;
  wallet_address: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AnalysisType {
  id: AnalysisTypeId;
  name: string;
  modality: string;
  description: string;
  labels: string[];
}

export interface DemoAccount {
  role: Role;
  name: string;
  email: string;
  password: string;
  description: string;
}

export interface Meta {
  analysis_types: AnalysisType[];
  max_upload_mb: number;
  chain: { chain_id: number; contract_address: string; explorer_url: string | null };
  demo_accounts: DemoAccount[] | null;
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
  status: StudyStatus;
  analysis_type: AnalysisTypeId;
  analysis_name: string;
  modality: string;
  patient: UserSummary;
  clinician: UserSummary;
  top_finding: string | null;
  created_at: string;
  published_at: string | null;
}

export interface StudyDetail extends StudySummary {
  model_id: string;
  predictions: Prediction[];
  final_finding: string | null;
  impression: string | null;
  ai_agrees: boolean | null;
  has_heatmap: boolean;
  record: RecordInfo | null;
}

export interface PatientOverview {
  patient: UserSummary;
  date_of_birth: string | null;
  shared_with_me: boolean;
  published_studies: number;
  last_study_at: string | null;
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

export interface AdminOverview {
  users: Record<Role, number>;
  studies: Record<StudyStatus, number>;
  services: Record<string, ServiceCheck>;
}

export interface NewUser {
  name: string;
  email: string;
  role: Role;
  title?: string;
  date_of_birth?: string;
  password?: string;
}

export interface VerifyResult {
  authentic: boolean;
  report_sha256: string;
  record_id: string | null;
  published_at: string | null;
  issuer: { name: string; title: string | null } | null;
  analysis_name: string | null;
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

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** URL of a study file. Same-origin, so the session cookie authorizes it in <img> and links. */
export const fileUrl = (studyId: string, kind: FileKind) =>
  `${BASE}/studies/${encodeURIComponent(studyId)}/files/${kind}`;

export const api = {
  meta: () => request<Meta>("/meta"),

  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) =>
    request<User>("/auth/login", json("POST", { email, password })),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  changePassword: (current_password: string, new_password: string) =>
    request<User>("/auth/password", json("POST", { current_password, new_password })),

  studies: (params: { status?: StudyStatus; patient_id?: string; limit?: number } = {}) =>
    request<StudySummary[]>(`/studies${query(params)}`),
  study: (id: string) => request<StudyDetail>(`/studies/${encodeURIComponent(id)}`),
  createStudy: (patientId: string, analysisType: AnalysisTypeId, file: File) => {
    const form = new FormData();
    form.append("patient_id", patientId);
    form.append("analysis_type", analysisType);
    form.append("file", file);
    return request<StudyDetail>("/studies", { method: "POST", body: form });
  },
  publishStudy: (id: string, final_finding: string, impression: string) =>
    request<StudyDetail>(
      `/studies/${encodeURIComponent(id)}/publish`,
      json("POST", { final_finding, impression }),
    ),
  discardStudy: (id: string) =>
    request<void>(`/studies/${encodeURIComponent(id)}`, { method: "DELETE" }),
  studyActivity: (id: string) =>
    request<AuditEvent[]>(`/studies/${encodeURIComponent(id)}/activity`),

  careTeam: () => request<CareTeamMember[]>("/sharing"),
  share: (clinician_id: string) =>
    request<CareTeamMember[]>("/sharing", json("POST", { clinician_id })),
  unshare: (clinicianId: string) =>
    request<void>(`/sharing/${encodeURIComponent(clinicianId)}`, { method: "DELETE" }),
  searchClinicians: (q: string) => request<UserSummary[]>(`/directory/clinicians${query({ q })}`),
  searchPatients: (q: string) => request<PatientOverview[]>(`/directory/patients${query({ q })}`),
  myPatients: () => request<PatientOverview[]>("/patients"),
  activity: () => request<AuditEvent[]>("/activity"),

  adminOverview: () => request<AdminOverview>("/admin/overview"),
  adminUsers: (params: { role?: Role; q?: string } = {}) =>
    request<User[]>(`/admin/users${query(params)}`),
  createUser: (body: NewUser) =>
    request<{ user: User; temporary_password: string | null }>("/admin/users", json("POST", body)),
  setUserActive: (id: string, is_active: boolean) =>
    request<User>(`/admin/users/${encodeURIComponent(id)}`, json("PATCH", { is_active })),
  auditLog: (params: { action?: string; limit?: number; offset?: number } = {}) =>
    request<AuditEvent[]>(`/admin/audit${query(params)}`),

  verify: (file: File, recordId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (recordId) form.append("record_id", recordId);
    return request<VerifyResult>("/verify", { method: "POST", body: form });
  },
};
