import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Meta, StudySummary, User } from "./lib/api";
import { routes } from "./router";

const META: Meta = {
  analysis_types: [
    {
      id: "brain_tumor",
      name: "Brain tumor",
      modality: "MRI",
      description: "Four classes.",
      labels: ["Glioma"],
    },
  ],
  max_upload_mb: 10,
  chain: {
    chain_id: 31337,
    contract_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    explorer_url: null,
  },
  demo_accounts: [
    {
      role: "patient",
      name: "Priya Sharma",
      email: "priya.sharma@medichain.example",
      password: "medichain-demo",
      description: "Owns her records.",
    },
    {
      role: "clinician",
      name: "Dr. Ananya Rao",
      email: "ananya.rao@medichain.example",
      password: "medichain-demo",
      description: "Signs reports.",
    },
  ],
};

const user = (role: User["role"], name: string): User => ({
  id: `${role}-1`,
  name,
  role,
  title: null,
  reference: "MC-1234ABCD",
  email: `${role}@medichain.example`,
  date_of_birth: role === "patient" ? "1979-03-14" : null,
  wallet_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
  last_login_at: null,
});

const STUDY: StudySummary = {
  id: "study-1",
  status: "published",
  analysis_type: "brain_tumor",
  analysis_name: "Brain tumor screening",
  modality: "MRI",
  patient: user("patient", "Priya Sharma"),
  clinician: user("clinician", "Dr. Ananya Rao"),
  top_finding: "Glioma",
  created_at: "2026-10-18T09:00:00Z",
  published_at: "2026-10-18T09:05:00Z",
};

// Role pages are lazy-loaded; the first dynamic import can be slow in jsdom.
const SLOW = { timeout: 5000 };

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

/** A tiny fake API: `signedIn` starts as the session user (or null) and login switches it. */
function mockApi(signedIn: User | null) {
  let current = signedIn;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace("/api/v1", "");
    if (path === "/meta") return json(META);
    if (path === "/auth/me")
      return current ? json(current) : json({ detail: "Please sign in." }, 401);
    if (path === "/auth/login") {
      const { email } = JSON.parse(init?.body as string) as { email: string };
      current = email.startsWith("ananya")
        ? user("clinician", "Dr. Ananya Rao")
        : user("patient", "Priya Sharma");
      return json(current);
    }
    if (path.startsWith("/studies")) return json([STUDY]);
    if (path === "/sharing") return json([]);
    if (path === "/patients") return json([]);
    if (path === "/verify") {
      return json({
        authentic: true,
        report_sha256: "ab".repeat(32),
        record_id: "0x" + "11".repeat(32),
        published_at: "2026-10-18T09:05:00Z",
        issuer: { name: "Dr. Ananya Rao", title: "Consultant radiologist" },
        analysis_name: "Brain tumor screening",
        matches_expected_record: null,
      });
    }
    return json({ detail: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("App", () => {
  it("sends signed-out visitors to login, which offers demo accounts", async () => {
    mockApi(null);
    const router = renderAt("/records");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Frecords");
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
  });

  it("signs in with a demo account and lands on the role's home", async () => {
    const fetchMock = mockApi(null);
    renderAt("/login");

    await screen.findByText("Priya Sharma"); // demo accounts arrive with /meta
    const [, patientDemo] = screen.getAllByRole("button", { name: "Sign in" });
    await userEvent.click(patientDemo!);

    expect(await screen.findByRole("heading", { name: "Your records" }, SLOW)).toBeInTheDocument();
    expect(await screen.findByText("Glioma")).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/login"));
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
      email: "priya.sharma@medichain.example",
      password: "medichain-demo",
    });
  });

  it("keeps each role on its own pages", async () => {
    mockApi(user("clinician", "Dr. Ananya Rao"));
    const router = renderAt("/records");

    expect(
      await screen.findByRole("heading", { name: /Good to see you/ }, SLOW),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/worklist");
  });

  it("verifies a report without signing in", async () => {
    mockApi(null);
    renderAt("/verify");

    const input = await screen.findByLabelText(/Drop the report PDF/);
    await userEvent.upload(
      input,
      new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByRole("heading", { name: "Authentic report" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Ananya Rao, Consultant radiologist")).toBeInTheDocument();
  });
});
