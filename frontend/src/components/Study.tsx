/** Building blocks for showing an imaging study. Shared by patient and clinician screens. */

import { ArrowSquareOutIcon, SealCheckIcon } from "@phosphor-icons/react";
import { Link } from "react-router";

import { fileUrl, type StudyDetail } from "../lib/api";
import { age, formatDate, formatDateTime, shortHash } from "../lib/format";
import { explorerTxUrl, useMeta } from "../lib/queries";
import { Badge, Card, DetailList, Prediction, SectionTitle, StudyStatusBadge } from "./ui";
import { buttonClass } from "./ui/classes";

export function StudyHeader({
  study,
  viewer,
}: {
  study: StudyDetail;
  viewer: "patient" | "clinician";
}) {
  const patient = study.patient;
  const when = study.published_at ?? study.created_at;
  return (
    <header className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge>{study.modality}</Badge>
        <StudyStatusBadge status={study.status} />
      </div>
      <h1 className="text-ink-strong font-serif text-4xl leading-[1.1] tracking-[-0.02em] sm:text-[44px]">
        {study.analysis_name}
      </h1>
      <p className="text-muted mt-3 text-sm">
        {viewer === "clinician" && (
          <>
            <span className="text-ink-strong font-medium">{patient.name}</span> ·{" "}
            {patient.reference} ·{" "}
          </>
        )}
        {study.status === "published" ? "Signed" : "Analysed"} {formatDateTime(when)} by{" "}
        {study.clinician.name}
        {study.clinician.title ? `, ${study.clinician.title}` : ""}
      </p>
    </header>
  );
}

export function ClinicalReview({ study }: { study: StudyDetail }) {
  if (study.status !== "published" || !study.final_finding) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">
            Clinician's finding
          </p>
          <p className="text-ink-strong mt-1 font-serif text-3xl tracking-[-0.02em]">
            {study.final_finding}
          </p>
        </div>
        {study.ai_agrees === true && <Badge tone="ok">Agrees with AI</Badge>}
        {study.ai_agrees === false && <Badge tone="info">Differs from AI</Badge>}
      </div>
      <p className="text-ink mt-5 leading-relaxed whitespace-pre-line">{study.impression}</p>
      <p className="text-muted border-line mt-6 border-t pt-4 text-sm">
        Signed by {study.clinician.name}
        {study.clinician.title ? `, ${study.clinician.title}` : ""}
        {study.published_at ? ` on ${formatDate(study.published_at)}` : ""}.
      </p>
    </Card>
  );
}

export function AiFindings({ study }: { study: StudyDetail }) {
  return (
    <Card>
      <SectionTitle>AI findings</SectionTitle>
      <ul className="space-y-3">
        {study.predictions.map((p, index) => (
          <Prediction key={p.label} label={p.label} score={p.score} highlight={index === 0} />
        ))}
      </ul>
      <p className="text-muted mt-5 text-xs">
        {study.model_id} · Decision support only. The clinician's review is the clinical
        interpretation.
      </p>
    </Card>
  );
}

export function ScanImages({ study }: { study: StudyDetail }) {
  return (
    <Card>
      <SectionTitle>Images</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
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
              Model attention. Warmer areas influenced the AI more.
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
        The report's fingerprint is anchored on-chain. Anyone you send the PDF to can confirm it is
        genuine on the{" "}
        <Link
          to={`/verify?record=${record.record_id}`}
          className="text-ink-strong underline underline-offset-2"
        >
          verification page
        </Link>
        .
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
            {
              label: "Scan SHA-256",
              value: record.scan_sha256,
              display: shortHash(record.scan_sha256, 6, 4),
              mono: true,
              copy: true,
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function PatientFacts({
  dateOfBirth,
  reference,
}: {
  dateOfBirth: string | null;
  reference: string;
}) {
  return (
    <span>
      {reference}
      {dateOfBirth && ` · Born ${formatDate(dateOfBirth)} (${age(dateOfBirth)})`}
    </span>
  );
}
