import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { Badge, Button, Card, DetailList } from "../../components/ui";
import type { AnalysisResult as Result } from "../../lib/api";
import { percent, shortHash } from "../../lib/format";

interface AnalysisResultProps {
  result: Result;
  patientId: string;
  previewUrl: string | null;
  anchored: boolean;
  txHash: string | null;
  opening: boolean;
  onOpenReport: () => void;
  onViewRecord: () => void;
  onReset: () => void;
}

export function AnalysisResult({
  result,
  patientId,
  previewUrl,
  anchored,
  txHash,
  opening,
  onOpenReport,
  onViewRecord,
  onReset,
}: AnalysisResultProps) {
  const [top, ...rest] = result.predictions;

  return (
    <Card className="motion-safe:animate-enter space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">Top finding</p>
          <h2 className="text-ink-strong mt-1 font-serif text-4xl leading-tight tracking-[-0.02em]">
            {top?.label ?? "No finding"}
          </h2>
          {top && (
            <p className="text-muted mt-1 font-mono text-sm tabular-nums">
              {percent(top.score)} confidence
            </p>
          )}
        </div>
        {anchored ? (
          <Badge tone="ok">Anchored on-chain</Badge>
        ) : (
          <Badge tone="warn">Not anchored yet</Badge>
        )}
      </header>

      {rest.length > 0 && (
        <section aria-label="All findings">
          <ul className="space-y-3">
            {result.predictions.map((prediction, index) => (
              <li
                key={prediction.label}
                className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-3"
              >
                <span className="text-ink truncate text-sm">{prediction.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <span
                    className={`ease-soft block h-full origin-left rounded-full transition-transform duration-700 ${index === 0 ? "bg-ink-strong" : "bg-muted/60"}`}
                    style={{ transform: `scaleX(${prediction.score})` }}
                  />
                </span>
                <span className="text-muted text-right font-mono text-xs tabular-nums">
                  {percent(prediction.score)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Visual evidence" className="grid gap-4 sm:grid-cols-2">
        {previewUrl && (
          <figure>
            <img
              src={previewUrl}
              alt="Original scan"
              className="aspect-square w-full rounded-lg bg-black object-contain"
            />
            <figcaption className="text-muted mt-2 text-xs">Original scan</figcaption>
          </figure>
        )}
        {result.heatmap_png && (
          <figure>
            <img
              src={`data:image/png;base64,${result.heatmap_png}`}
              alt="Scan with the regions the model relied on highlighted"
              className="aspect-square w-full rounded-lg bg-black object-contain"
            />
            <figcaption className="text-muted mt-2 text-xs">
              Model attention. Warmer areas influenced the prediction more.
            </figcaption>
          </figure>
        )}
      </section>

      <DetailList
        items={[
          { label: "Patient ID", value: patientId, mono: true },
          { label: "Model", value: result.model_id, mono: true },
          {
            label: "Scan SHA-256",
            value: result.scan.sha256,
            display: shortHash(result.scan.sha256, 10, 8),
            mono: true,
            copy: true,
          },
          {
            label: "Scan CID",
            value: result.scan.cid,
            display: shortHash(result.scan.cid, 10, 8),
            mono: true,
            copy: true,
          },
          {
            label: "Report CID",
            value: result.report.cid,
            display: shortHash(result.report.cid, 10, 8),
            mono: true,
            copy: true,
          },
          ...(txHash
            ? [
                {
                  label: "Transaction",
                  value: txHash,
                  display: shortHash(txHash, 10, 8),
                  mono: true,
                  copy: true,
                },
              ]
            : []),
        ]}
      />

      <footer className="border-line flex flex-wrap items-center gap-3 border-t pt-6">
        <Button
          disabled={!anchored}
          loading={opening}
          icon={<ArrowSquareOutIcon weight="bold" className="size-4" aria-hidden />}
          onClick={onOpenReport}
        >
          Open report
        </Button>
        <Button variant="secondary" disabled={!anchored} onClick={onViewRecord}>
          View record
        </Button>
        <Button variant="ghost" className="sm:ml-auto" onClick={onReset}>
          New analysis
        </Button>
      </footer>

      <p className="text-muted text-xs">
        Preliminary AI output from a research model. It is not a diagnosis and must be reviewed by a
        qualified clinician.
      </p>
    </Card>
  );
}
