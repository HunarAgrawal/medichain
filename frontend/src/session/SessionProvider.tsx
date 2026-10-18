import { BrowserProvider, getAddress } from "ethers";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiError, type Meta } from "../lib/api";
import { connectRecords, describeChainError, switchChain } from "../lib/chain";
import { SessionContext, type SessionStatus, type SessionValue } from "./context";

const STORAGE_KEY = "medichain.session";

interface StoredSession {
  address: string;
  token: string;
  expiresAt: string;
}

// Tab-scoped storage: the session survives a reload but not closing the tab.
function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as StoredSession) : null;
    return stored && new Date(stored.expiresAt) > new Date() ? stored : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the in-memory session still works.
  }
}

function firstAccount(accounts: unknown): string | null {
  return Array.isArray(accounts) && typeof accounts[0] === "string"
    ? getAddress(accounts[0])
    : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const wallet = typeof window === "undefined" ? undefined : window.ethereum;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaAttempt, setMetaAttempt] = useState(0);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [session, setSession] = useState<StoredSession | null>(loadSession);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .meta()
      .then((value) => {
        if (cancelled) return;
        setMeta(value);
        setMetaError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setMetaError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [metaAttempt]);

  useEffect(() => {
    if (!wallet) return;
    const onAccounts = (accounts: unknown) => setAddress(firstAccount(accounts));
    const onChain = (id: unknown) => setChainId(typeof id === "string" ? parseInt(id, 16) : null);
    wallet.request({ method: "eth_accounts" }).then(onAccounts, () => undefined);
    wallet.request({ method: "eth_chainId" }).then(onChain, () => undefined);
    wallet.on?.("accountsChanged", onAccounts);
    wallet.on?.("chainChanged", onChain);
    return () => {
      wallet.removeListener?.("accountsChanged", onAccounts);
      wallet.removeListener?.("chainChanged", onChain);
    };
  }, [wallet]);

  const endSession = useCallback((message: string | null) => {
    saveSession(null);
    setSession(null);
    setError(message);
  }, []);

  // A session belongs to one wallet: switching accounts in the wallet suspends it.
  const active = session && address && session.address === address ? session : null;

  useEffect(() => {
    if (!active) return;
    const remaining = new Date(active.expiresAt).getTime() - Date.now();
    const timer = setTimeout(
      () => endSession("Your session expired. Sign in again."),
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [active, endSession]);

  const signIn = useCallback(async () => {
    if (!wallet) return;
    setSigningIn(true);
    setError(null);
    try {
      const account = firstAccount(await wallet.request({ method: "eth_requestAccounts" }));
      if (!account) throw new Error("No wallet account selected.");
      setAddress(account);
      const challenge = await api.challenge(account);
      const signer = await new BrowserProvider(wallet).getSigner(account);
      const signature = await signer.signMessage(challenge.message);
      const issued = await api.session(challenge.nonce, signature);
      const stored = {
        address: getAddress(issued.address),
        token: issued.token,
        expiresAt: issued.expires_at,
      };
      saveSession(stored);
      setSession(stored);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : describeChainError(reason));
    } finally {
      setSigningIn(false);
    }
  }, [wallet]);

  const switchNetwork = useCallback(async () => {
    if (!wallet || !meta) return;
    try {
      await switchChain(wallet, meta.chain_id);
      setError(null);
    } catch (reason) {
      setError(describeChainError(reason));
    }
  }, [wallet, meta]);

  const records = useCallback(() => {
    if (!wallet || !meta) return Promise.reject(new Error("Wallet is not connected."));
    return connectRecords(wallet, meta.contract_address);
  }, [wallet, meta]);

  const value = useMemo<SessionValue>(() => {
    let status: SessionStatus;
    if (metaError) status = "api-error";
    else if (!meta) status = "loading";
    else if (!wallet) status = "no-wallet";
    else if (signingIn) status = "signing-in";
    else if (active) status = "signed-in";
    else status = "signed-out";

    return {
      status,
      meta,
      error: status === "api-error" ? metaError : error,
      address,
      token: active?.token ?? null,
      chainId,
      wrongNetwork: Boolean(meta && chainId !== null && chainId !== meta.chain_id),
      signIn,
      signOut: () => endSession(null),
      expireSession: () => endSession("Your session expired. Sign in again."),
      switchNetwork,
      retry: () => {
        setMetaError(null);
        setMetaAttempt((attempt) => attempt + 1);
      },
      records,
    };
  }, [
    meta,
    metaError,
    wallet,
    signingIn,
    active,
    error,
    address,
    chainId,
    signIn,
    endSession,
    switchNetwork,
    records,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
