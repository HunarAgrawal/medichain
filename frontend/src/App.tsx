import { useState } from "react";

import { Header, type Tab } from "./components/Header";
import { ApiUnavailable, Loading, Welcome } from "./components/Screens";
import { Alert, Button } from "./components/ui";
import { NewAnalysis } from "./features/analysis/NewAnalysis";
import { PATIENT_ID_PATTERN } from "./features/analysis/validation";
import { RecordsView } from "./features/records/RecordsView";
import { chainName } from "./lib/chain";
import { useSession } from "./session/context";
import { SessionProvider } from "./session/SessionProvider";

/** Report QR codes link to `/?record=<patientId>`. */
function recordFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("record");
  return id && PATIENT_ID_PATTERN.test(id) ? id : null;
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const session = useSession();
  const [recordQuery, setRecordQuery] = useState(recordFromUrl);
  const [tab, setTab] = useState<Tab>(recordQuery ? "records" : "analyze");

  function viewRecord(patientId: string) {
    setRecordQuery(patientId);
    setTab("records");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-ink-strong sr-only z-20 rounded-md px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header tab={tab} onTabChange={setTab} />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {session.status === "loading" ? (
          <Loading />
        ) : session.status === "api-error" ? (
          <ApiUnavailable />
        ) : session.status === "signed-in" && session.meta ? (
          <div className="space-y-6">
            {session.wrongNetwork && (
              <Alert
                tone="warning"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void session.switchNetwork()}
                  >
                    Switch network
                  </Button>
                }
              >
                Your wallet is on the wrong network. Medichain uses{" "}
                {chainName(session.meta.chain_id)}.
              </Alert>
            )}
            {session.error && <Alert tone="error">{session.error}</Alert>}
            {tab === "analyze" ? (
              <NewAnalysis key={session.address} onViewRecord={viewRecord} />
            ) : (
              <RecordsView key={`${session.address}:${recordQuery}`} initialQuery={recordQuery} />
            )}
          </div>
        ) : (
          <Welcome />
        )}
      </main>

      <footer className="border-line border-t">
        <p className="text-muted mx-auto max-w-6xl px-4 py-6 text-xs sm:px-6">
          Research prototype. AI findings are preliminary and must be reviewed by a qualified
          clinician. Use synthetic or consented data only.
        </p>
      </footer>
    </div>
  );
}
