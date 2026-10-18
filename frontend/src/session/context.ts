import { createContext, useContext } from "react";

import type { Meta } from "../lib/api";
import type { RecordsClient } from "../lib/chain";

export type SessionStatus =
  "loading" | "api-error" | "no-wallet" | "signed-out" | "signing-in" | "signed-in";

export interface SessionValue {
  status: SessionStatus;
  meta: Meta | null;
  error: string | null;
  address: string | null;
  token: string | null;
  chainId: number | null;
  wrongNetwork: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  /** Call when the API answers 401: the token expired or was revoked. */
  expireSession: () => void;
  switchNetwork: () => Promise<void>;
  retry: () => void;
  records: () => Promise<RecordsClient>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

/** Narrowed session for screens that only render once signed in. */
export function useSignedInSession(): SessionValue & {
  meta: Meta;
  token: string;
  address: string;
} {
  const session = useSession();
  if (!session.meta || !session.token || !session.address) {
    throw new Error("useSignedInSession requires a signed-in session");
  }
  return session as SessionValue & { meta: Meta; token: string; address: string };
}
