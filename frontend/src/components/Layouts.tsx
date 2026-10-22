import { SignOutIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";

import { homePath, useLogout, useMe, useUser } from "../auth/session";
import type { Role } from "../lib/api";
import { Avatar, Badge, Button } from "./ui";
import { cx } from "./ui/classes";
import { ROLE_LABEL } from "../lib/roles";

const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  patient: [
    { to: "/records", label: "Records" },
    { to: "/sharing", label: "Sharing" },
    { to: "/activity", label: "Activity" },
  ],
  clinician: [
    { to: "/worklist", label: "Worklist" },
    { to: "/studies/new", label: "New study" },
    { to: "/patients", label: "Patients" },
  ],
  admin: [
    { to: "/admin", label: "Overview", end: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/audit", label: "Audit log" },
  ],
};

// Point this at your fork if you deploy a modified version (AGPL-3.0 §13).
const SOURCE_URL = "https://github.com/HunarAgrawal/medichain";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
    isActive ? "bg-black/[0.05] text-ink-strong" : "text-muted hover:text-ink-strong",
  );

function Brand({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="Medichain home">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="text-ink-strong font-medium tracking-tight">Medichain</span>
    </Link>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="bg-ink-strong sr-only z-30 rounded-md px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  );
}

function Footer() {
  return (
    <footer className="border-line border-t">
      <div className="text-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
        <p>Research prototype. AI findings support clinicians; they are not a diagnosis.</p>
        <nav aria-label="Footer" className="flex items-center gap-5">
          <Link to="/verify" className="hover:text-ink-strong underline-offset-4 hover:underline">
            Verify a report
          </Link>
          {/* AGPL-3.0 §13: users of a network service must be offered its source code. */}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink-strong underline-offset-4 hover:underline"
          >
            Source code (AGPL-3.0)
          </a>
        </nav>
      </div>
    </footer>
  );
}

function Shell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      {header}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function AppLayout() {
  const user = useUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const links = NAV[user.role].map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
      {item.label}
    </NavLink>
  ));

  return (
    <Shell
      header={
        <header className="border-line bg-canvas/85 sticky top-0 z-20 border-b backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Brand to={homePath(user.role)} />
            <nav aria-label="Primary" className="hidden gap-1 md:flex">
              {links}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <Badge>{ROLE_LABEL[user.role]}</Badge>
              </span>
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2 rounded-lg py-1 pr-2.5 pl-1 transition-colors hover:bg-black/[0.04]",
                    isActive && "bg-black/[0.05]",
                  )
                }
              >
                <Avatar name={user.name} size="sm" />
                <span className="text-ink-strong hidden max-w-40 truncate text-sm lg:inline">
                  {user.name}
                </span>
              </NavLink>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                title="Sign out"
                loading={logout.isPending}
                icon={<SignOutIcon weight="bold" className="size-4" aria-hidden />}
                onClick={() =>
                  logout.mutate(undefined, { onSettled: () => void navigate("/login") })
                }
              />
            </div>
          </div>
          <nav
            aria-label="Primary"
            className="border-line flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden"
          >
            {links}
          </nav>
        </header>
      }
    >
      <Outlet />
    </Shell>
  );
}

export function PublicLayout() {
  const { data: user } = useMe();
  return (
    <Shell
      header={
        <header className="border-line border-b">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Brand to="/" />
            {user ? (
              <Link to={homePath(user.role)} className="text-muted hover:text-ink-strong text-sm">
                Back to Medichain
              </Link>
            ) : (
              <Link to="/login" className="text-muted hover:text-ink-strong text-sm">
                Sign in
              </Link>
            )}
          </div>
        </header>
      }
    >
      <Outlet />
    </Shell>
  );
}
