import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, type Role, type User } from "../lib/api";

export const meKey = ["me"] as const;

/** The signed-in user, or null when there is no valid session. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** For screens rendered inside <RequireRole>: the user is guaranteed to exist. */
export function useUser(): User {
  const { data } = useMe();
  if (!data) throw new Error("useUser must be used inside <RequireRole>");
  return data;
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.login(email, password),
    onSuccess: (user) => {
      client.clear();
      client.setQueryData(meKey, user);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      client.clear();
      client.setQueryData(meKey, null);
    },
  });
}

const HOME: Record<Role, string> = {
  patient: "/records",
  clinician: "/worklist",
  admin: "/admin",
};

export function homePath(role: Role): string {
  return HOME[role];
}

/** Only follow same-app relative paths after login (no open redirects). */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
