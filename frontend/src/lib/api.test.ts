import { describe, expect, it, vi } from "vitest";

import { api, ApiError, errorMessage } from "./api";

const json = (body: unknown, status = 400) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("errorMessage", () => {
  it("uses a string detail as-is", async () => {
    expect(await errorMessage(json({ detail: "Record not found." }, 404))).toBe(
      "Record not found.",
    );
  });

  it("names the field for validation errors", async () => {
    const body = {
      detail: [{ loc: ["body", "patient_age"], msg: "Input should be less than 131" }],
    };
    expect(await errorMessage(json(body, 422))).toBe("patient age: Input should be less than 131");
  });

  it("falls back to the status code when the body is not JSON", async () => {
    expect(await errorMessage(new Response("<html>", { status: 502 }))).toBe(
      "Request failed (502).",
    );
  });
});

describe("api", () => {
  it("sends the bearer token and raises ApiError with the server message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: "You do not have access." }, 403));
    vi.stubGlobal("fetch", fetchMock);

    const error = await api.recordFile("token-123", "P-1", "report").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe("You do not have access.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/records\/P-1\/report$/);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-123" });
  });

  it("reports an unreachable backend clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await api.meta().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/Cannot reach/);
  });
});
