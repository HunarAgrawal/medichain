/** Building blocks for showing a study (imaging or laboratory). Shared by staff and patients. */

import { ArrowSquareOutIcon, CheckIcon, SealCheckIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

import { fileUrl, type StudyDetail } from "../lib/api";
import { ageSex } from "../lib/clinical";
import { formatDateTime, shortHash } from "../lib/format";
import { explorerTxUrl, useMeta } from "../lib/queries";
import { CriticalBadge, PriorityBadge, StatusBadge, Turnaround, WaitingTime } from "./Clinical";
import { LabResults } from "./Lab";
import { Badge, Card, DetailList, Prediction, SectionTitle } from "./ui";
import { buttonClass, cx } from "./ui/classes";

/** Title row plus the patient and order details the reporting doctor reads first. */
export function StudyBanner({
  study,
  showPatient = true,
}: {
  study: StudyDetail;
  showPatient?: boolean;
}) {
  const facts: [string, string][] = [
    ["Accession", study.accession],
    ["Site", study.site.name],
    ["Referred by", study.referred_by ?? "Self"],
    [
      study.discipline === "laboratory" ? "Collected" : "Acquired",
      formatDateTime(study.created_at),
    ],
  ];
  return (
    <header className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge>{study.modality}</Badge>
        <PriorityBadge priority={study.priority} />
        <StatusBadge study={study} />
        {study.critical && <CriticalBadge />}
      </div>
      <h1 className="text-ink-strong font-serif text-4xl leading-[1.1] tracking-[-0.02em] sm:text-[44px]">
        {showPatient ? study.patient.name : study.analysis_name}
      </h1>
      <p className="text-muted mt-2 text-sm">
        {showPatient ? (
          <>
            <Link
              to={`/patients/${study.patient.id}`}
              className="hover:text-ink-strong underline-offset-4 hover:underline"
            >
              {study.patient.uhid}
            </Link>
            {ageSex(study.patient) && ` · ${ageSex(study.patient)}`} · {study.analysis_name}
          </>
        ) : (
          `${study.accession} · ${study.site.name}`
        )}
      </p>
      {showPatient && (
        <dl className="border-line mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted text-xs">{label}</dt>
              <dd className="text-ink-strong truncate" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {study.indication && (
        <p className="bg-subtle border-line mt-4 rounded-lg border px-4 py-3 text-sm">
          <span className="text-muted">Clinical indication: </span>
          <span className="text-ink-strong">{study.indication}</span>
        </p>
      )}
    </header>
  );
}

export function SignedReport({ study }: { study: StudyDetail }) {
  if (study.status !== "published" || !study.final_finding) return null;
  const signer = study.reporter;
  return (
    <Card className={cx(study.critical && "border-bad/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">Impression</p>
          <p className="text-ink-strong mt-1 font-serif text-3xl tracking-[-0.02em]">
            {study.final_finding}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {study.critical && <CriticalBadge />}
          {study.ai_agrees === true && <Badge tone="ok">Agrees with AI</Badge>}
          {study.ai_agrees === false && <Badge tone="info">Differs from AI</Badge>}
        </div>
      </div>
      <p className="text-ink mt-4 leading-relaxed whitespace-pre-line">{study.impression}</p>
      {study.findings && (
        <>
          <p className="text-muted mt-6 text-xs font-medium tracking-[0.06em] uppercase">
            Findings
          </p>
          <p className="text-ink mt-1.5 leading-relaxed whitespace-pre-line">{study.findings}</p>
        </>
      )}
      <p className="text-muted border-line mt-6 border-t pt-4 text-sm">
        Signed by {signer?.name}
        {signer?.title ? `, ${signer.title}` : ""}
        {study.published_at ? ` on ${formatDateTime(study.published_at)}` : ""}
        {study.turnaround_minutes !== null && (
          <>
            {" "}
            · turnaround <Turnaround study={study} />
          </>
        )}
      </p>
    </Card>
  );
}

/** What the report is based on: the images and AI pre-read, or the flagged lab results. */
export function StudyEvidence({ study }: { study: StudyDetail }) {
  if (study.discipline === "laboratory") return <LabResults study={study} />;
  return (
    <>
      <ScanImages study={study} />
      <AiFindings study={study} />
    </>
  );
}

export function AiFindings({ study }: { study: StudyDetail }) {
  if (study.predictions.length === 0) return null;
  return (
    <Card>
      <SectionTitle>AI pre-read</SectionTitle>
      <ul className="space-y-3">
        {study.predictions.map((p, index) => (
          <Prediction key={p.label} label={p.label} score={p.score} highlight={index === 0} />
        ))}
      </ul>
      <p className="text-muted mt-5 text-xs">
        {study.model_id} · Decision support only. The signed report is the clinical interpretation.
      </p>
    </Card>
  );
}

export function ScanImages({ study }: { study: StudyDetail }) {
  return (
    <Card>
      <SectionTitle>Images</SectionTitle>
      <div className={cx("grid gap-4", study.has_heatmap && "sm:grid-cols-2")}>
        <figure>
          <img
            src={fileUrl(study.id, "scan")}
            alt={`${study.modality} scan`}
            className="aspect-square w-full rounded-lg bg-black object-contain"
          />
          <figcaption className="text-muted mt-2 text-xs">Original scan</figcaption>
        </figure>
        {study.has_heatmap && (
          <figure>
            <img
              src={fileUrl(study.id, "heatmap")}
              alt="Scan with the regions the model relied on highlighted"
              className="aspect-square w-full rounded-lg bg-black object-contain"
            />
            <figcaption className="text-muted mt-2 text-xs">
              AI attention. Warmer areas influenced the model more.
            </figcaption>
          </figure>
        )}
      </div>
    </Card>
  );
}

export function RecordProof({ study }: { study: StudyDetail }) {
  const { data: meta } = useMeta();
  const record = study.record;
  if (!record) return null;
  return (
    <Card>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <SealCheckIcon aria-hidden weight="bold" className="text-ok size-4" /> Signed report
        </span>
      </SectionTitle>
      <a
        href={fileUrl(study.id, "report")}
        target="_blank"
        rel="noreferrer"
        className={`${buttonClass("primary")} w-full`}
      >
        <ArrowSquareOutIcon aria-hidden weight="bold" className="size-4" /> Open report (PDF)
      </a>
      <p className="text-muted mt-4 text-xs leading-relaxed">
        The report's fingerprint is registered on a tamper-evident ledger. Anyone you send the PDF
        to can confirm it is genuine on the{" "}
        <Link
          to={`/verify?record=${record.record_id}`}
          className="text-ink-strong underline underline-offset-2"
        >
          verification page
        </Link>
        , or by scanning its QR code.
      </p>
      <div className="mt-4">
        <DetailList
          items={[
            {
              label: "Record ID",
              value: record.record_id,
              display: shortHash(record.record_id, 6, 4),
              mono: true,
              copy: true,
            },
            {
              label: "Transaction",
              value: record.tx_hash,
              display: shortHash(record.tx_hash, 6, 4),
              mono: true,
              copy: true,
              href: explorerTxUrl(meta?.chain.explorer_url, record.tx_hash),
            },
            {
              label: "Report SHA-256",
              value: record.report_sha256,
              display: shortHash(record.report_sha256, 6, 4),
              mono: true,
              copy: true,
            },
          ]}
        />
      </div>
    </Card>
  );
}

/** Where a study is, without any clinical content: for technicians and waiting referrers. */
export function StudyProgress({ study }: { study: StudyDetail }) {
  const reported = study.status === "published";
  const lab = study.discipline === "laboratory";
  const steps = [
    {
      label: lab ? "Results entered" : "Acquired",
      detail: `${formatDateTime(study.created_at)} by ${study.created_by.name}`,
      done: true,
    },
    lab
      ? { label: "Auto-flagged", detail: "Checked against reference intervals", done: true }
      : { label: "AI pre-read", detail: "Completed in seconds", done: true },
    {
      label: reported ? "Reported" : "Awaiting report",
      detail: reported
        ? `${study.published_at ? formatDateTime(study.published_at) : ""}${study.reporter ? ` by ${study.reporter.name}` : ""}`
        : null,
      done: reported,
    },
  ];
  return (
    <Card>
      <SectionTitle>Progress</SectionTitle>
      <ol className="space-y-4">
        {steps.map((step) => (
          <li key={step.label} className="flex gap-3">
            <span
              className={cx(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                step.done ? "bg-ok text-white" : "border-line border-2 border-dashed",
              )}
            >
              {step.done && <CheckIcon aria-hidden weight="bold" className="size-3" />}
            </span>
            <span>
              <span className="text-ink-strong block text-sm font-medium">{step.label}</span>
              {step.detail ? (
                <span className="text-muted block text-xs">{step.detail}</span>
              ) : (
                <span className="text-muted block text-xs">
                  Waiting <WaitingTime study={study} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
