import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Meta, Role, StudySummary, User } from "./lib/api";
import { routes } from "./router";

const ORG = {
  id: "org-1",
  name: "Arogya Multispeciality Hospital",
  short_name: "Arogya Hospital",
  kind: "hospital" as const,
  city: "Noida",
};

const META: Meta = {
  analysis_types: [
    {
      id: "chest_xray",
      name: "Pneumonia screening",
      modality: "Chest X-ray",
      description: "Pneumonia.",
      labels: ["Normal", "Pneumonia"],
    },
  ],
  max_upload_mb: 10,
  tat_targets_minutes: { stat: 60, urgent: 240, routine: 1440 },
  chain: {
    chain_id: 31337,
    contract_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    explorer_url: null,
  },
  demo: {
    password: "medichain-demo",
    workspace: ORG,
    personas: [
      {
        role: "technician",
        name: "Rahul Verma",
        email: "rahul.verma@arogya.example",
        title: "Radiographer",
        description: "Registers patients.",
      },
      {
        role: "radiologist",
        name: "Dr. Ananya Rao",
        email: "ananya.rao@arogya.example",
        title: "Consultant Radiologist",
        description: "Reports the worklist.",
      },
      {
        role: "doctor",
        name: "Dr. Arjun Mehta",
        email: "arjun.mehta@arogya.example",
        title: "Pulmonologist",
        description: "Gets reports.",
      },
    ],
  },
};

const user = (role: Role, name: string): User => ({
  id: `${role}-1`,
  name,
  role,
  title: null,
  reference: "MC-1234ABCD",
  email: `${role}@arogya.example`,
  phone: null,
  qualification: null,
  registration_number: null,
  site: null,
  wallet_address: null,
  is_active: true,
  created_at: "2026-11-01T00:00:00Z",
  last_login_at: null,
  organization: ORG,
});

const STUDY: StudySummary = {
  id: "study-1",
  accession: "ACC-261118-0001",
  status: "draft",
  priority: "stat",
  analysis_type: "chest_xray",
  analysis_name: "Pneumonia screening",
  modality: "Chest X-ray",
  patient: { id: "p-1", name: "Aman Gupta", uhid: "AMH-26-000031", sex: "M", age: 54 },
  site: { id: "s-1", name: "Main campus · Radiology", code: "MAIN" },
  referred_by: "Dr. Arjun Mehta",
  radiologist: null,
  top_finding: "Pneumonia",
  critical: false,
  created_at: new Date(Date.now() - 14 * 60_000).toISOString(),
  published_at: null,
  turnaround_minutes: null,
};

const REPORTED: StudySummary = {
  ...STUDY,
  id: "study-2",
  status: "published",
  critical: true,
  radiologist: {
    id: "r-1",
    name: "Dr. Ananya Rao",
    role: "radiologist",
    title: null,
    reference: "MC-2",
  },
  published_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  turnaround_minutes: 30,
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
    const path = url.replace("/api/v1", "").split("?")[0];
    if (path === "/meta") return json(META);
    if (path === "/auth/me")
      return current ? json(current) : json({ detail: "Please sign in." }, 401);
    if (path === "/auth/logout") {
      current = null;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path === "/auth/login") {
      const { email } = JSON.parse(init?.body as string) as { email: string };
      const persona = META.demo?.personas.find((p) => p.email === email);
      current = persona ? user(persona.role, persona.name) : user("patient", "Priya Sharma");
      return json(current);
    }
    if (path === "/studies") {
      if (current?.role === "doctor") return json([REPORTED]);
      return json(url.includes("status=published") ? [] : [STUDY]);
    }
    if (path === "/sites") return json([]);
    if (path === "/verify") {
      return json({
        authentic: true,
        report_sha256: "ab".repeat(32),
        record_id: "0x" + "11".repeat(32),
        published_at: "2026-11-18T09:05:00Z",
        issuer: {
          name: "Dr. Ananya Rao",
          title: "Consultant Radiologist",
          qualification: "MD (Radiodiagnosis)",
          registration_number: "UPMC-21458",
          organization: "Arogya Multispeciality Hospital",
        },
        analysis_name: "Pneumonia screening",
        accession: "ACC-261118-0001",
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
  it("lets a visitor enter the demo as a radiologist from the landing page", async () => {
    const fetchMock = mockApi(null);
    const router = renderAt("/");

    expect(
      await screen.findByRole("heading", { name: /patients and doctors can trust/ }),
    ).toBeInTheDocument();
    const demo = screen.getByRole("heading", { name: /Pick a role/ }).closest("section")!;
    await userEvent.click(within(demo).getByRole("button", { name: /Dr. Ananya Rao/ }));

    expect(await screen.findByRole("heading", { name: "Worklist" }, SLOW)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/worklist");
    expect(await screen.findByText("Aman Gupta")).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/login"));
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
      email: "ananya.rao@arogya.example",
      password: "medichain-demo",
    });
  });

  it("sends signed-out visitors to sign-in, which offers the demo roles", async () => {
    mockApi(null);
    const router = renderAt("/worklist");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Fworklist");
    expect(await screen.findByText("Rahul Verma")).toBeInTheDocument();
  });

  it("keeps each role on its own pages", async () => {
    mockApi(user("technician", "Rahul Verma"));
    const router = renderAt("/worklist");

    expect(await screen.findByRole("heading", { name: "Today" }, SLOW)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/desk");
  });

  it("shows a referring doctor their critical findings first", async () => {
    mockApi(user("doctor", "Dr. Arjun Mehta"));
    renderAt("/reports");

    const alerts = await screen.findByRole(
      "heading",
      { name: /Critical findings this week/ },
      SLOW,
    );
    expect(within(alerts.closest("section")!).getByText("Aman Gupta")).toBeInTheDocument();
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
    expect(
      screen.getByText("Dr. Ananya Rao, MD (Radiodiagnosis), Consultant Radiologist"),
    ).toBeInTheDocument();
    expect(screen.getByText("Arogya Multispeciality Hospital")).toBeInTheDocument();
  });
});
