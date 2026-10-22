import { FilePdfIcon, SealCheckIcon, SealWarningIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router";

import { Button, Card, DetailList, ErrorAlert, PageHeader } from "../components/ui";
import { cx } from "../components/ui/classes";
import { api, type VerifyResult } from "../lib/api";
import { formatBytes, formatDateTime, shortHash } from "../lib/format";

const RECORD_ID = /^0x[0-9a-fA-F]{64}$/;

export function VerifyPage() {
  const [params] = useSearchParams();
  const recordParam = params.get("record");
  const recordId = recordParam && RECORD_ID.test(recordParam) ? recordParam : null;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const verify = useMutation({ mutationFn: (pdf: File) => api.verify(pdf, recordId) });

  function choose(next: File | undefined) {
    if (!next) return;
    setFile(next);
    verify.mutate(next);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Verify a report"
        description="Check that a Medichain report is genuine and unaltered. The file is fingerprinted and compared with the registry; it is not stored."
      />
      <div className="space-y-6">
        {recordId && (
          <p className="text-muted text-sm">
            Checking against record{" "}
            <span className="text-ink-strong font-mono">{shortHash(recordId, 10, 8)}</span> from the
            report's QR code.
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          id="report-file"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <label
          htmlFor="report-file"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "bg-surface flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center transition-colors",
            dragging ? "border-ink-strong bg-subtle" : "hover:bg-subtle border-[#d8d8d6]",
          )}
        >
          <FilePdfIcon aria-hidden weight="bold" className="text-muted size-6" />
          <span className="text-ink-strong text-sm font-medium">
            {file ? file.name : "Drop the report PDF here or choose a file"}
          </span>
          <span className="text-muted text-xs">
            {file ? formatBytes(file.size) : "PDF, up to 20 MB"}
          </span>
        </label>

        {verify.isPending && <p className="text-muted text-sm">Checking the registry…</p>}
        <ErrorAlert error={verify.error} />
        {verify.data && <VerifyOutcome result={verify.data} />}
        {verify.data && (
          <Button variant="secondary" onClick={() => input.current?.click()}>
            Check another file
          </Button>
        )}
      </div>
    </div>
  );
}

function VerifyOutcome({ result }: { result: VerifyResult }) {
  if (!result.authentic) {
    return (
      <Card className="border-bad/30">
        <div className="flex items-start gap-3">
          <SealWarningIcon aria-hidden weight="bold" className="text-bad mt-1 size-6 shrink-0" />
          <div>
            <h2 className="text-ink-strong font-serif text-2xl tracking-[-0.02em]">
              No matching report
            </h2>
            <p className="text-muted mt-1 text-sm">
              This file's fingerprint is not on the registry. It may have been edited, or it was not
              issued through Medichain. Ask the sender for the original PDF.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <DetailList
            items={[
              {
                label: "File SHA-256",
                value: result.report_sha256,
                display: shortHash(result.report_sha256, 12, 10),
                mono: true,
                copy: true,
              },
            ]}
          />
        </div>
      </Card>
    );
  }
  const mismatch = result.matches_expected_record === false;
  return (
    <Card className={mismatch ? "border-warn/40" : "border-ok/30"}>
      <div className="flex items-start gap-3">
        <SealCheckIcon
          aria-hidden
          weight="bold"
          className={cx("mt-1 size-6 shrink-0", mismatch ? "text-warn" : "text-ok")}
        />
        <div>
          <h2 className="text-ink-strong font-serif text-2xl tracking-[-0.02em]">
            Authentic report
          </h2>
          <p className="text-muted mt-1 text-sm">
            {mismatch
              ? "This report is genuine, but it belongs to a different record than the QR code you followed."
              : "This exact file was signed and registered by a verified clinician. It has not been altered."}
          </p>
        </div>
      </div>
      <div className="mt-5">
        <DetailList
          items={[
            ...(result.issuer
              ? [
                  {
                    label: "Signed by",
                    value:
                      result.issuer.name + (result.issuer.title ? `, ${result.issuer.title}` : ""),
                  },
                ]
              : []),
            ...(result.analysis_name ? [{ label: "Study", value: result.analysis_name }] : []),
            ...(result.published_at
              ? [{ label: "Registered", value: formatDateTime(result.published_at) }]
              : []),
            ...(result.record_id
              ? [
                  {
                    label: "Record ID",
                    value: result.record_id,
                    display: shortHash(result.record_id, 10, 8),
                    mono: true,
                    copy: true,
                  },
                ]
              : []),
            {
              label: "File SHA-256",
              value: result.report_sha256,
              display: shortHash(result.report_sha256, 10, 8),
              mono: true,
              copy: true,
            },
          ]}
        />
      </div>
    </Card>
  );
}
