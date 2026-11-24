import { ArrowLeftIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useUser } from "../../auth/session";
import { ActivityList } from "../../components/Activity";
import {
  AiFindings,
  RecordProof,
  ScanImages,
  SignedReport,
  StudyBanner,
  StudyProgress,
} from "../../components/Study";
import {
  Alert,
  Button,
  Card,
  ConfirmButton,
  ErrorAlert,
  Field,
  PageError,
  PageLoading,
  SectionTitle,
  Select,
} from "../../components/ui";
import { cx, inputClass, textareaClass } from "../../components/ui/classes";
import { api, fileUrl, type StudyDetail, type User } from "../../lib/api";
import { useMeta } from "../../lib/queries";
import { HOME } from "../../lib/roles";
import { REPORT_TEMPLATES } from "../../lib/templates";

const OTHER = "__other__";
const IMPRESSION_MAX = 2000;
const FINDINGS_MAX = 4000;

export function StudyPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const study = useQuery({ queryKey: ["study", id], queryFn: () => api.study(id) });

  if (study.isPending) return <PageLoading />;
  if (study.error) return <PageError error={study.error} onRetry={() => void study.refetch()} />;
  const data = study.data;
  const back =
    user.role === "radiologist"
      ? { to: "/worklist", label: "Worklist" }
      : user.role === "doctor"
        ? { to: "/reports", label: "Reports" }
        : { to: HOME[user.role], label: "Today" };

  return (
    <>
      <Link
        to={back.to}
        className="text-muted hover:text-ink-strong mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon aria-hidden weight="bold" className="size-3.5" /> {back.label}
      </Link>
      <StudyBanner study={data} />
      {data.access === "status" ? (
        <StatusView study={data} user={user} />
      ) : data.status === "draft" ? (
        <ReportingWorkspace study={data} />
      ) : (
        <ReportView study={data} user={user} />
      )}
    </>
  );
}

function StatusView({ study, user }: { study: StudyDetail; user: User }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const discard = useMutation({
    mutationFn: () => api.discardStudy(study.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["studies"] });
      void navigate(HOME[user.role]);
    },
  });
  const ownDraft = study.status === "draft" && study.created_by.id === user.id;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {user.role === "doctor" && study.status === "draft" && (
          <Alert tone="info">
            The radiologist is reporting this study. You will see the signed report here, and in
            your reports list, the moment it is ready.
          </Alert>
        )}
        {user.role === "technician" && study.status === "draft" && (
          <Card>
            <SectionTitle>Acquired image</SectionTitle>
            <img
              src={fileUrl(study.id, "scan")}
              alt={`${study.modality} scan`}
              className="aspect-square w-full max-w-md rounded-lg bg-black object-contain"
            />
          </Card>
        )}
        {study.status === "published" && (
          <Alert tone="success">
            Reported and delivered to {study.referred_by ? "the referring doctor and " : ""}the
            patient. Report contents are visible only to clinicians with access.
          </Alert>
        )}
      </div>
      <aside className="space-y-4">
        <StudyProgress study={study} />
        {ownDraft && (
          <Card>
            <SectionTitle>Wrong patient or image?</SectionTitle>
            <p className="text-muted mb-3 text-sm">
              Discard this study before it is reported, then acquire it again.
            </p>
            <ErrorAlert error={discard.error} />
            <ConfirmButton
              confirmLabel="Discard study"
              loading={discard.isPending}
              onConfirm={() => discard.mutate()}
            >
              Discard study
            </ConfirmButton>
          </Card>
        )}
      </aside>
    </div>
  );
}

function ReportView({ study, user }: { study: StudyDetail; user: User }) {
  const activity = useQuery({
    queryKey: ["study-activity", study.id],
    queryFn: () => api.studyActivity(study.id),
  });
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-6">
        <SignedReport study={study} />
        <ScanImages study={study} />
        <AiFindings study={study} />
      </div>
      <aside className="space-y-6 lg:sticky lg:top-24">
        <RecordProof study={study} />
        <Card>
          <SectionTitle>Record activity</SectionTitle>
          {activity.data ? (
            <ActivityList events={activity.data} me={user} empty="No activity yet." />
          ) : (
            <p className="text-muted text-sm">Loading…</p>
          )}
        </Card>
      </aside>
    </div>
  );
}

function ReportingWorkspace({ study }: { study: StudyDetail }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="min-w-0 space-y-6">
        <ScanImages study={study} />
        <AiFindings study={study} />
      </div>
      <aside className="xl:sticky xl:top-24">
        <ReportForm study={study} />
      </aside>
    </div>
  );
}

function ReportForm({ study }: { study: StudyDetail }) {
  const { data: meta } = useMeta();
  const client = useQueryClient();
  const navigate = useNavigate();
  const labels = meta?.analysis_types.find((t) => t.id === study.analysis_type)?.labels ?? [];
  const aiTop = study.predictions[0]?.label ?? "";
  const [choice, setChoice] = useState(aiTop);
  const [other, setOther] = useState("");
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [critical, setCritical] = useState(false);
  const [attested, setAttested] = useState(false);
  const finding = choice === OTHER ? other.trim() : choice;
  const template = REPORT_TEMPLATES[finding];
  const valid = finding.length > 0 && impression.trim().length >= 10 && attested;

  const publish = useMutation({
    mutationFn: () =>
      api.publishStudy(study.id, {
        final_finding: finding,
        findings: findings.trim() || undefined,
        impression: impression.trim(),
        critical,
      }),
    onSuccess: (updated) => {
      client.setQueryData(["study", study.id], updated);
      void client.invalidateQueries({ queryKey: ["studies"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const discard = useMutation({
    mutationFn: () => api.discardStudy(study.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["studies"] });
      void navigate("/worklist");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) publish.mutate();
  }

  return (
    <Card>
      <SectionTitle>Your report</SectionTitle>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={publish.isPending} className="space-y-5">
          <Field
            id="finding"
            label="Final finding"
            hint={aiTop ? `AI suggestion: ${aiTop}` : undefined}
          >
            <Select id="finding" value={choice} onChange={(event) => setChoice(event.target.value)}>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
              <option value="Inconclusive">Inconclusive</option>
              <option value={OTHER}>Other…</option>
            </Select>
          </Field>
          {choice === OTHER && (
            <Field id="other-finding" label="Describe the finding">
              <input
                id="other-finding"
                className={inputClass}
                maxLength={60}
                value={other}
                onChange={(event) => setOther(event.target.value)}
              />
            </Field>
          )}
          {template && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFindings(template.findings);
                setImpression(template.impression);
              }}
            >
              Start from the {finding.toLowerCase()} template
            </Button>
          )}
          <Field id="findings" label="Findings" hint="Optional. What you see.">
            <textarea
              id="findings"
              className={cx(textareaClass, "min-h-24")}
              maxLength={FINDINGS_MAX}
              rows={4}
              value={findings}
              onChange={(event) => setFindings(event.target.value)}
            />
          </Field>
          <Field
            id="impression"
            label="Impression"
            hint={`${impression.length}/${IMPRESSION_MAX}. Your conclusion and recommendation.`}
          >
            <textarea
              id="impression"
              className={cx(textareaClass, "min-h-24")}
              maxLength={IMPRESSION_MAX}
              rows={3}
              value={impression}
              onChange={(event) => setImpression(event.target.value)}
            />
          </Field>
          <label
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
              critical ? "border-bad/40 bg-bad-soft text-bad" : "border-line text-ink",
            )}
          >
            <input
              type="checkbox"
              className="accent-bad mt-0.5 size-4 shrink-0"
              checked={critical}
              onChange={(event) => setCritical(event.target.checked)}
            />
            <span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <WarningOctagonIcon aria-hidden weight="bold" className="size-4" /> Critical finding
              </span>
              <span className={cx("block text-xs", critical ? "text-bad/80" : "text-muted")}>
                Flags the report for the referring doctor's urgent attention.
              </span>
            </span>
          </label>
          <label className="text-ink flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-ink-strong mt-0.5 size-4 shrink-0"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
            I have reviewed the images and the AI pre-read, and this report reflects my clinical
            judgement.
          </label>
        </fieldset>
        <ErrorAlert error={publish.error ?? discard.error} />
        <Button type="submit" className="w-full" disabled={!valid} loading={publish.isPending}>
          {publish.isPending ? "Signing and delivering" : "Sign and deliver report"}
        </Button>
        <p className="text-muted text-xs leading-relaxed">
          {publish.isPending
            ? "Rendering the PDF on the hospital letterhead, encrypting it and registering its fingerprint."
            : `Delivers the signed PDF to ${study.patient.name}${study.referred_by ? ` and ${study.referred_by}` : ""}. A signed report cannot be edited.`}
        </p>
        <div className="border-line border-t pt-4">
          <ConfirmButton
            variant="ghost"
            confirmLabel="Discard study"
            loading={discard.isPending}
            onConfirm={() => discard.mutate()}
          >
            Discard study
          </ConfirmButton>
        </div>
      </form>
    </Card>
  );
}
