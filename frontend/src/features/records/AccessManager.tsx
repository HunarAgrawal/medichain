import { getAddress, isAddress } from "ethers";
import { useEffect, useState, type FormEvent } from "react";

import { Alert, Button, CopyButton, inputClass } from "../../components/ui";
import { describeChainError } from "../../lib/chain";
import { shortHash } from "../../lib/format";
import { useSignedInSession } from "../../session/context";

type Notice = { tone: "success" | "error"; text: string } | null;
type Pending = { action: "grant" | "revoke"; address: string } | null;

export function AccessManager({ patientId }: { patientId: string }) {
  const session = useSignedInSession();
  const [grantees, setGrantees] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [version, setVersion] = useState(0);
  const { records } = session;

  // Re-read the grantee list from the contract whenever an access change is confirmed.
  useEffect(() => {
    let cancelled = false;
    records()
      .then((client) => client.getGrantees(patientId))
      .then(
        (list) => {
          if (!cancelled) setGrantees(list);
        },
        (error: unknown) => {
          if (cancelled) return;
          setGrantees([]);
          setNotice({ tone: "error", text: describeChainError(error) });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [records, patientId, version]);

  async function change(action: "grant" | "revoke", address: string) {
    setPending({ action, address });
    setNotice(null);
    try {
      const records = await session.records();
      if (action === "grant") await records.grantAccess(patientId, address);
      else await records.revokeAccess(patientId, address);
      setNotice({
        tone: "success",
        text: `${action === "grant" ? "Granted access to" : "Revoked access for"} ${shortHash(address)}.`,
      });
      if (action === "grant") setDraft("");
      setVersion((current) => current + 1);
    } catch (error) {
      setNotice({ tone: "error", text: describeChainError(error) });
    } finally {
      setPending(null);
    }
  }

  function grant(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!isAddress(value))
      return setInputError("Enter a valid wallet address (0x followed by 40 hex characters).");
    const address = getAddress(value);
    if (address === session.address) return setInputError("You already own this record.");
    setInputError(null);
    void change("grant", address);
  }

  return (
    <section aria-labelledby="access-heading" className="border-line space-y-4 border-t pt-6">
      <div>
        <h3 id="access-heading" className="text-ink-strong text-sm font-medium">
          Access
        </h3>
        <p className="text-muted text-sm">
          Wallets listed here can open this record. Each change is an on-chain transaction.
        </p>
      </div>

      {grantees === null ? (
        <div className="h-10 animate-pulse rounded-md bg-black/[0.04]" />
      ) : grantees.length === 0 ? (
        <p className="text-muted bg-subtle rounded-md px-3 py-2.5 text-sm">
          Only your wallet can open this record.
        </p>
      ) : (
        <ul className="border-line divide-line divide-y rounded-md border">
          {grantees.map((address) => (
            <li key={address} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <span
                className="text-ink-strong min-w-0 flex-1 truncate font-mono text-[13px]"
                title={address}
              >
                {address}
              </span>
              <CopyButton value={address} label="address" />
              <Button
                variant="ghost"
                size="sm"
                loading={pending?.action === "revoke" && pending.address === address}
                disabled={pending !== null}
                onClick={() => void change("revoke", address)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form noValidate onSubmit={grant} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="grantee" className="sr-only">
            Wallet address to grant access
          </label>
          <input
            id="grantee"
            className={`${inputClass} font-mono`}
            placeholder="0x… wallet address"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            disabled={pending !== null}
            aria-invalid={Boolean(inputError)}
            aria-describedby={inputError ? "grantee-error" : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setInputError(null);
            }}
          />
          {inputError && (
            <p id="grantee-error" className="text-bad mt-1.5 text-xs">
              {inputError}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="secondary"
          loading={pending?.action === "grant"}
          disabled={pending !== null || !draft.trim()}
        >
          Grant access
        </Button>
      </form>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
    </section>
  );
}
