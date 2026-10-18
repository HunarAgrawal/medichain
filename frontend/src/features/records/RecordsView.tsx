import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, Button, Card, PageHeader, inputClass } from "../../components/ui";
import { describeChainError, type OnChainRecord } from "../../lib/chain";
import { useSignedInSession } from "../../session/context";
import { PATIENT_ID_PATTERN } from "../analysis/validation";
import { RecordDetails } from "./RecordDetails";
import { recentRecords, rememberRecord } from "./recent";

type Lookup =
  | { state: "idle" }
  | { state: "loading"; patientId: string }
  | { state: "error"; message: string }
  | { state: "found"; patientId: string; record: OnChainRecord };

export function RecordsView({ initialQuery }: { initialQuery: string | null }) {
  const session = useSignedInSession();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [recent, setRecent] = useState(() => recentRecords(session.address));
  const openedInitial = useRef(false);

  const open = useCallback(
    async (patientId: string) => {
      setQuery(patientId);
      if (!PATIENT_ID_PATTERN.test(patientId)) {
        setLookup({
          state: "error",
          message: "Patient IDs use 1–64 letters, numbers, hyphens or underscores.",
        });
        return;
      }
      setLookup({ state: "loading", patientId });
      try {
        const records = await session.records();
        const record = await records.getRecord(patientId);
        setRecent(rememberRecord(session.address, patientId));
        setLookup({ state: "found", patientId, record });
      } catch (error) {
        setLookup({ state: "error", message: describeChainError(error) });
      }
    },
    [session],
  );

  useEffect(() => {
    if (!initialQuery || openedInitial.current) return;
    openedInitial.current = true;
    void open(initialQuery);
  }, [initialQuery, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void open(query.trim());
  }

  return (
    <>
      <PageHeader
        title="Records"
        description="Open a record by patient ID. You can open records you created and records whose owner granted your wallet access."
      />

      <div className="space-y-6">
        <form onSubmit={submit} className="flex gap-2" role="search">
          <label htmlFor="record-query" className="sr-only">
            Patient ID
          </label>
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon
              aria-hidden
              weight="bold"
              className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id="record-query"
              className={`${inputClass} pl-9 font-mono`}
              placeholder="Patient ID, e.g. MRI-2026-0142"
              value={query}
              maxLength={64}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button type="submit" loading={lookup.state === "loading"} disabled={!query.trim()}>
            Open record
          </Button>
        </form>

        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Recent</span>
            {recent.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => void open(id)}
                className="border-line bg-surface text-ink hover:bg-subtle rounded-md border px-2.5 py-1 font-mono text-xs transition-colors"
              >
                {id}
              </button>
            ))}
          </div>
        )}

        {lookup.state === "idle" && (
          <Card className="text-center">
            <p className="text-ink-strong font-medium">No record open</p>
            <p className="text-muted mx-auto mt-1 max-w-md text-sm">
              Enter a patient ID above. Records are read straight from the contract with your
              wallet, so you only see what you are allowed to.
            </p>
          </Card>
        )}
        {lookup.state === "loading" && (
          <Card className="space-y-4">
            <div className="h-8 w-48 animate-pulse rounded bg-black/[0.05]" />
            <div className="h-24 animate-pulse rounded-lg bg-black/[0.04]" />
            <div className="h-20 animate-pulse rounded-lg bg-black/[0.04]" />
          </Card>
        )}
        {lookup.state === "error" && <Alert tone="error">{lookup.message}</Alert>}
        {lookup.state === "found" && (
          <RecordDetails
            key={lookup.patientId}
            patientId={lookup.patientId}
            record={lookup.record}
          />
        )}
      </div>
    </>
  );
}
