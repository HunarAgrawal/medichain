import { LockKeyIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Alert, Button, PageHeader } from "../../components/ui";
import { api, ApiError, type AnalysisResult as Result } from "../../lib/api";
import { describeChainError } from "../../lib/chain";
import { openBlobInTab } from "../../lib/format";
import { useBlobUrl } from "../../lib/useBlobUrl";
import { useSignedInSession } from "../../session/context";
import { rememberRecord } from "../records/recent";
import { AnalysisForm } from "./AnalysisForm";
import { AnalysisResult } from "./AnalysisResult";
import { PipelineSteps } from "./PipelineSteps";
import { validateDraft, type AnalysisDraft, type DraftErrors } from "./validation";

type Phase =
  | { step: "editing"; error?: string }
  | { step: "analyzing" }
  | { step: "confirming"; result: Result }
  | { step: "anchoring"; result: Result }
  | { step: "anchor-failed"; result: Result; error: string }
  | { step: "done"; result: Result; txHash: string };

export function NewAnalysis({ onViewRecord }: { onViewRecord: (patientId: string) => void }) {
  const session = useSignedInSession();
  const [draft, setDraft] = useState<AnalysisDraft>(() =>
    emptyDraft(session.meta.analysis_types[0]?.id),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [phase, setPhase] = useState<Phase>({ step: "editing" });
  const [previewUrl, setPreview] = useBlobUrl();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const patientId = draft.patientId.trim();

  function update(patch: Partial<AnalysisDraft>) {
    if ("file" in patch) setPreview(patch.file ?? null);
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as keyof DraftErrors];
      return next;
    });
  }

  async function anchor(result: Result) {
    setPhase({ step: "confirming", result });
    try {
      const records = await session.records();
      const txHash = await records.createRecord(patientId, result.scan.cid, result.report.cid, () =>
        setPhase({ step: "anchoring", result }),
      );
      rememberRecord(session.address, patientId);
      setPhase({ step: "done", result, txHash });
    } catch (error) {
      setPhase({ step: "anchor-failed", result, error: describeChainError(error) });
    }
  }

  async function submit() {
    const found = validateDraft(draft, session.meta.max_upload_mb);
    setErrors(found);
    if (Object.keys(found).length > 0 || !draft.file) return;
    if (session.wrongNetwork) {
      setPhase({ step: "editing", error: "Switch your wallet to the network shown above first." });
      return;
    }

    setPhase({ step: "analyzing" });
    let result: Result;
    try {
      result = await api.analyze(session.token, {
        analysisType: draft.analysisType,
        patientId,
        patientName: draft.patientName.trim(),
        patientAge: Number(draft.patientAge),
        file: draft.file,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return session.expireSession();
      setPhase({ step: "editing", error: error instanceof Error ? error.message : String(error) });
      return;
    }
    await anchor(result);
  }

  async function openReport() {
    setOpening(true);
    setOpenError(null);
    try {
      await openBlobInTab(() => api.recordFile(session.token, patientId, "report"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return session.expireSession();
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
    }
  }

  function reset() {
    setPhase({ step: "editing" });
    setDraft(emptyDraft(draft.analysisType));
    setPreview(null);
    setOpenError(null);
  }

  return (
    <>
      <PageHeader
        title="New analysis"
        description="Run a model on a scan, store the scan and its PDF report encrypted on IPFS, and anchor both to your wallet on-chain."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {phase.step === "editing" || phase.step === "analyzing" ? (
            <AnalysisForm
              draft={draft}
              errors={errors}
              analysisTypes={session.meta.analysis_types}
              maxUploadMb={session.meta.max_upload_mb}
              previewUrl={previewUrl}
              busy={phase.step === "analyzing"}
              error={phase.step === "editing" ? phase.error : undefined}
              onChange={update}
              onSubmit={() => void submit()}
            />
          ) : (
            <>
              {openError && <Alert tone="error">{openError}</Alert>}
              <AnalysisResult
                result={phase.result}
                patientId={patientId}
                previewUrl={previewUrl}
                anchored={phase.step === "done"}
                txHash={phase.step === "done" ? phase.txHash : null}
                opening={opening}
                onOpenReport={() => void openReport()}
                onViewRecord={() => onViewRecord(patientId)}
                onReset={reset}
              />
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <PipelineSteps phase={phase.step} />
          {phase.step === "anchor-failed" && (
            <Alert
              tone="error"
              action={
                <Button size="sm" variant="secondary" onClick={() => void anchor(phase.result)}>
                  Retry
                </Button>
              }
            >
              {phase.error} The files are stored; retrying only repeats the transaction.
            </Alert>
          )}
          <div className="text-muted flex gap-3 px-1 text-xs leading-relaxed">
            <LockKeyIcon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
            <p>
              Files are encrypted with AES-256-GCM before they reach IPFS. Only your wallet, and
              wallets you grant access, can open them.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function emptyDraft(analysisType: AnalysisDraft["analysisType"] = "brain_tumor"): AnalysisDraft {
  return { analysisType, patientId: "", patientName: "", patientAge: "", file: null };
}
