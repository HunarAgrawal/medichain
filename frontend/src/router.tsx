import type { ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";

import { RequireRole } from "./auth/RequireRole";
import { AppLayout, PublicLayout } from "./components/Layouts";
import { HomeRedirect, NotFound, RouteError } from "./components/RouteViews";
import { LoginPage } from "./pages/LoginPage";
import { VerifyPage } from "./pages/VerifyPage";

// Role pages load on demand, so each role only downloads its own screens.
const page = (load: () => Promise<Record<string, unknown>>, name: string) => async () => ({
  Component: (await load())[name] as ComponentType,
});

export const routes: RouteObject[] = [
  { path: "/", element: <HomeRedirect />, errorElement: <RouteError /> },
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/verify", element: <VerifyPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    element: <RequireRole roles={["patient", "clinician", "admin"]} />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/account", lazy: page(() => import("./pages/AccountPage"), "AccountPage") },
          {
            element: <RequireRole roles={["patient"]} />,
            children: [
              {
                path: "/records",
                lazy: page(() => import("./pages/patient/RecordsPage"), "RecordsPage"),
              },
              {
                path: "/records/:id",
                lazy: page(() => import("./pages/patient/RecordPage"), "RecordPage"),
              },
              {
                path: "/sharing",
                lazy: page(() => import("./pages/patient/SharingPage"), "SharingPage"),
              },
              {
                path: "/activity",
                lazy: page(() => import("./pages/patient/ActivityPage"), "ActivityPage"),
              },
            ],
          },
          {
            element: <RequireRole roles={["clinician"]} />,
            children: [
              {
                path: "/worklist",
                lazy: page(() => import("./pages/clinician/WorklistPage"), "WorklistPage"),
              },
              {
                path: "/studies/new",
                lazy: page(() => import("./pages/clinician/NewStudyPage"), "NewStudyPage"),
              },
              {
                path: "/studies/:id",
                lazy: page(() => import("./pages/clinician/StudyPage"), "StudyPage"),
              },
              {
                path: "/patients",
                lazy: page(() => import("./pages/clinician/PatientsPage"), "PatientsPage"),
              },
              {
                path: "/patients/:id",
                lazy: page(() => import("./pages/clinician/PatientPage"), "PatientPage"),
              },
            ],
          },
          {
            element: <RequireRole roles={["admin"]} />,
            children: [
              {
                path: "/admin",
                lazy: page(() => import("./pages/admin/OverviewPage"), "OverviewPage"),
              },
              {
                path: "/admin/users",
                lazy: page(() => import("./pages/admin/UsersPage"), "UsersPage"),
              },
              {
                path: "/admin/audit",
                lazy: page(() => import("./pages/admin/AuditPage"), "AuditPage"),
              },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
