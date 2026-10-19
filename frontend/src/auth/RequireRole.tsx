import { Navigate, Outlet, useLocation } from "react-router";

import { PageError, PageLoading } from "../components/ui";
import type { Role } from "../lib/api";
import { homePath, useMe } from "./session";

/** Route guard: signed-out users go to login, other roles go to their own home. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { data: user, isPending, error, refetch } = useMe();
  const location = useLocation();

  if (isPending) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={() => void refetch()} />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return <Outlet />;
}
