/** Typed client for the Medichain API. Field names mirror the API (snake_case). */

const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type AnalysisTypeId = "brain_tumor" | "chest_xray";
export type FileKind = "scan" | "report";

export interface AnalysisType {
  id: AnalysisTypeId;
  name: string;
  modality: string;
  description: string;
}

export interface Meta {
  chain_id: number;
  contract_address: string;
  max_upload_mb: number;
  analysis_types: AnalysisType[];
}

export interface Challenge {
  nonce: string;
  message: string;
  expires_at: string;
}

export interface Session {
  token: string;
  address: string;
  expires_at: string;
}

export interface Prediction {
  label: string;
  score: number;
}

export interface StoredFile {
  cid: string;
  sha256: string;
}

export interface AnalysisResult {
  report_id: string;
  created_at: string;
  analysis_type: AnalysisTypeId;
  model_id: string;
  predictions: Prediction[];
  heatmap_png: string | null;
  scan: StoredFile;
  report: StoredFile;
}

export interface AnalysisInput {
  analysisType: AnalysisTypeId;
  patientId: string;
  patientName: string;
  patientAge: number;
  file: File;
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

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request(path: string, { token, headers, ...init }: RequestOptions = {}) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Medichain API. Check that the backend is running.");
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
  return response;
}

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { loc?: unknown[]; msg?: string };
      const field = first.loc?.at(-1);
      const message = first.msg ?? "Invalid input";
      return typeof field === "string" ? `${field.replaceAll("_", " ")}: ${message}` : message;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `Request failed (${response.status}).`;
}

function postJson(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  async meta(): Promise<Meta> {
    return (await request("/meta")).json() as Promise<Meta>;
  },

  async challenge(address: string): Promise<Challenge> {
    return (await postJson("/auth/challenge", { address })).json() as Promise<Challenge>;
  },

  async session(nonce: string, signature: string): Promise<Session> {
    return (await postJson("/auth/session", { nonce, signature })).json() as Promise<Session>;
  },

  async analyze(token: string, input: AnalysisInput): Promise<AnalysisResult> {
    const form = new FormData();
    form.append("analysis_type", input.analysisType);
    form.append("patient_id", input.patientId);
    form.append("patient_name", input.patientName);
    form.append("patient_age", String(input.patientAge));
    form.append("file", input.file);
    const response = await request("/analyses", { method: "POST", body: form, token });
    return response.json() as Promise<AnalysisResult>;
  },

  async recordFile(token: string, patientId: string, kind: FileKind): Promise<Blob> {
    const path = `/records/${encodeURIComponent(patientId)}/${kind}`;
    return (await request(path, { token })).blob();
  },
};
