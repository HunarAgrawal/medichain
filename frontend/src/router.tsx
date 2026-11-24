import type { ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";

import { RequireRole } from "./auth/RequireRole";
import { AppLayout, PublicLayout } from "./components/Layouts";
import { NotFound, RouteError } from "./components/RouteViews";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { VerifyPage } from "./pages/VerifyPage";

// Role pages load on demand, so each role only downloads its own screens.
const page = (load: () => Promise<Record<string, unknown>>, name: string) => async () => ({
  Component: (await load())[name] as ComponentType,
});

const route = (path: string, load: () => Promise<Record<string, unknown>>, name: string) => ({
  path,
  lazy: page(load, name),
});

export const routes: RouteObject[] = [
  { path: "/", element: <LandingPage />, errorElement: <RouteError /> },
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
    element: (
      <RequireRole
        roles={["admin", "radiologist", "pathologist", "technician", "doctor", "patient"]}
      />
    ),
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          route("/account", () => import("./pages/AccountPage"), "AccountPage"),
          {
            element: <RequireRole roles={["technician"]} />,
            children: [route("/desk", () => import("./pages/staff/DeskPage"), "DeskPage")],
          },
          {
            element: <RequireRole roles={["technician", "radiologist", "pathologist"]} />,
            children: [
              route("/studies/new", () => import("./pages/staff/NewStudyPage"), "NewStudyPage"),
            ],
          },
          {
            element: <RequireRole roles={["technician", "radiologist", "pathologist", "doctor"]} />,
            children: [
              route("/patients", () => import("./pages/staff/PatientsPage"), "PatientsPage"),
              route("/patients/:id", () => import("./pages/staff/PatientPage"), "PatientPage"),
              route("/studies/:id", () => import("./pages/staff/StudyPage"), "StudyPage"),
            ],
          },
          {
            element: <RequireRole roles={["radiologist", "pathologist"]} />,
            children: [
              route("/worklist", () => import("./pages/radiologist/WorklistPage"), "WorklistPage"),
            ],
          },
          {
            element: <RequireRole roles={["doctor"]} />,
            children: [
              route("/reports", () => import("./pages/doctor/ReportsPage"), "ReportsPage"),
            ],
          },
          {
            element: <RequireRole roles={["patient"]} />,
            children: [
              route("/records", () => import("./pages/patient/RecordsPage"), "RecordsPage"),
              route("/records/:id", () => import("./pages/patient/RecordPage"), "RecordPage"),
              route("/sharing", () => import("./pages/patient/SharingPage"), "SharingPage"),
              route("/activity", () => import("./pages/patient/ActivityPage"), "ActivityPage"),
            ],
          },
          {
            element: <RequireRole roles={["admin"]} />,
            children: [
              route("/admin", () => import("./pages/admin/DashboardPage"), "DashboardPage"),
              route("/admin/staff", () => import("./pages/admin/StaffPage"), "StaffPage"),
              route("/admin/settings", () => import("./pages/admin/SettingsPage"), "SettingsPage"),
              route("/admin/audit", () => import("./pages/admin/AuditPage"), "AuditPage"),
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
