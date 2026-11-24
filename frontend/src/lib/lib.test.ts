import { describe, expect, it, vi } from "vitest";

import { api, ApiError, errorMessage, type Analyte, type AuditEvent, type User } from "./api";
import { ageSex, formatMinutes, formatPhone, maskAbha, tatState } from "./clinical";
import { describeEvent } from "./describeEvent";
import { age, formatDate, initials, shortHash } from "./format";
import { flagFor, formatReference, labValues } from "./labs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api client", () => {
  it("sends the CSRF header and same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "u1" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.login("a@example.com", "secret");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/login");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toMatchObject({
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    });
  });

  it("raises ApiError with the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Study not found." }, 404)));
    const error = await api.study("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "Study not found." });
  });

  it("returns nothing for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("explains an unreachable server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.meta()).rejects.toMatchObject({ status: 0 });
  });

  it("names the field for validation errors", async () => {
    const body = {
      detail: [{ loc: ["body", "new_password"], msg: "String should have at least 10 characters" }],
    };
    expect(await errorMessage(json(body, 422))).toBe(
      "new password: String should have at least 10 characters",
    );
    expect(await errorMessage(new Response("<html>", { status: 502 }))).toBe(
      "Request failed (502).",
    );
  });
});

const me = {
  id: "me",
  name: "Priya Sharma",
  role: "patient",
  title: null,
  reference: "MC-1",
} as User;
const rao = {
  id: "rao",
  name: "Dr. Ananya Rao",
  role: "radiologist" as const,
  title: "Radiologist",
  reference: "MC-2",
};
const event = (patch: Partial<AuditEvent>): AuditEvent => ({
  id: 1,
  at: "2026-10-19T10:00:00Z",
  action: "login",
  actor: null,
  target: null,
  study_id: null,
  detail: null,
  tx_hash: null,
  ...patch,
});

describe("describeEvent", () => {
  it("speaks from the viewer's point of view", () => {
    expect(
      describeEvent(event({ action: "file_viewed", actor: rao, target: me, detail: "report" }), me),
    ).toBe("Dr. Ananya Rao opened your report");
    expect(describeEvent(event({ action: "access_granted", actor: me, target: rao }), me)).toBe(
      "You shared records with Dr. Ananya Rao",
    );
    expect(describeEvent(event({ action: "study_published", actor: rao, target: me }), me)).toBe(
      "Dr. Ananya Rao signed a report for you",
    );
    expect(describeEvent(event({ action: "critical_finding", actor: rao, target: me }), me)).toBe(
      "Dr. Ananya Rao flagged a critical finding for you",
    );
    expect(
      describeEvent(event({ action: "file_viewed", actor: rao, target: rao, detail: "scan" }), me),
    ).toBe("Dr. Ananya Rao opened their scan");
    expect(
      describeEvent(event({ action: "user_created", target: me, detail: "patient" }), me),
    ).toBe("Setup created your patient account");
  });
});

describe("clinical", () => {
  it("formats turnaround times and judges them against targets", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(200)).toBe("3 h 20 min");
    expect(formatMinutes(60 * 26)).toBe("1 d 2 h");
    expect(tatState(30, 60)).toBe("ok");
    expect(tatState(55, 60)).toBe("near");
    expect(tatState(61, 60)).toBe("late");
  });

  it("shows patient facts compactly and masks identifiers", () => {
    expect(ageSex({ age: 47, sex: "F" })).toBe("47 y · F");
    expect(ageSex({ age: null, sex: null })).toBe("");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(maskAbha("12-3456-7890-1234")).toBe("XX-XXXX-XXXX-1234");
  });
});

describe("format", () => {
  it("handles calendar dates without timezone drift", () => {
    expect(formatDate("1979-03-14")).toContain("1979");
    expect(age("1979-03-14", new Date(2026, 2, 13))).toBe(46);
    expect(age("1979-03-14", new Date(2026, 2, 14))).toBe(47);
  });

  it("builds initials and short hashes", () => {
    expect(initials("Dr. Ananya Rao")).toBe("AR");
    expect(initials("Priya")).toBe("P");
    expect(shortHash("0x1234567890abcdef")).toBe("0x1234…cdef");
  });
});

describe("lab flags", () => {
  const hb: Analyte = {
    code: "hb",
    name: "Haemoglobin",
    unit: "g/dL",
    kind: "number",
    reference: { F: [12, 15], M: [13, 17] },
    critical_low: 7,
    critical_high: 20,
    decimals: 1,
    cutoff: null,
  };
  const thc: Analyte = { ...hb, code: "thc", kind: "screen", reference: {}, cutoff: "50 ng/mL" };

  it("mirrors the API: sex-specific intervals, critical limits and screens", () => {
    expect(flagFor(hb, "12.5", "F")).toBe("");
    expect(flagFor(hb, "12.5", "M")).toBe("L");
    expect(flagFor(hb, "12.5", null)).toBe("");
    expect(flagFor(hb, "6.9", "F")).toBe("LL");
    expect(flagFor(hb, "21", "M")).toBe("HH");
    expect(flagFor(hb, "", "F")).toBeNull();
    expect(flagFor(hb, "abc", "F")).toBeNull();
    expect(flagFor(thc, "positive", null)).toBe("POS");
    expect(flagFor(thc, "negative", null)).toBe("");
    expect(formatReference(hb, "M")).toBe("13.0 - 17.0");
    expect(formatReference(thc, null)).toBe("Negative (cutoff 50 ng/mL)");
    expect(labValues([hb, thc], { hb: " 9.6 ", thc: "Positive" })).toEqual({
      hb: 9.6,
      thc: "positive",
    });
  });
});
