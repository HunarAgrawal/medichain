import { describe, expect, it } from "vitest";

import { validateDraft, type AnalysisDraft } from "./validation";

const png = new File([new Uint8Array(1024)], "scan.png", { type: "image/png" });
const valid: AnalysisDraft = {
  analysisType: "chest_xray",
  patientId: "CXR-2026-0007",
  patientName: "Tomás Okafor",
  patientAge: "61",
  file: png,
};

describe("validateDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(valid, 10)).toEqual({});
  });

  it.each([
    ["patientId", { patientId: "has space" }],
    ["patientId", { patientId: "x".repeat(65) }],
    ["patientName", { patientName: "   " }],
    ["patientAge", { patientAge: "" }],
    ["patientAge", { patientAge: "131" }],
    ["file", { file: null }],
    ["file", { file: new File(["%PDF"], "report.pdf", { type: "application/pdf" }) }],
  ] as const)("flags %s", (field, patch) => {
    expect(validateDraft({ ...valid, ...patch }, 10)).toHaveProperty(field);
  });

  it("enforces the server's upload limit", () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" });
    expect(validateDraft({ ...valid, file: big }, 1).file).toBe("The file is larger than 1 MB.");
  });
});
