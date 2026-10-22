import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useUser } from "../../auth/session";
import { ActivityList } from "../../components/Activity";
import {
  AiFindings,
  ClinicalReview,
  RecordProof,
  ScanImages,
  StudyHeader,
} from "../../components/Study";
import {
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
import { inputClass, textareaClass } from "../../components/ui/classes";
import { api, type StudyDetail } from "../../lib/api";
import { useMeta } from "../../lib/queries";

const OTHER = "__other__";
const IMPRESSION_MAX = 2000;

export function StudyPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const study = useQuery({ queryKey: ["study", id], queryFn: () => api.study(id) });
  const isIssuer = study.data?.clinician.id === user.id;
  const activity = useQuery({
    queryKey: ["study-activity", id],
    queryFn: () => api.studyActivity(id),
    enabled: study.data?.status === "published" && isIssuer,
  });

  if (study.isPending) return <PageLoading />;
  if (study.error) return <PageError error={study.error} onRetry={() => void study.refetch()} />;
  const data = study.data;

  return (
    <>
      <Link
        to="/worklist"
        className="text-muted hover:text-ink-strong mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon aria-hidden weight="bold" className="size-3.5" /> Worklist
      </Link>
      <StudyHeader study={data} viewer="clinician" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <ClinicalReview study={data} />
          <ScanImages study={data} />
          <AiFindings study={data} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24">
          {data.status === "draft" && isIssuer ? (
            <ReviewForm study={data} />
          ) : (
            <>
              <RecordProof study={data} />
              {isIssuer && (
                <Card>
                  <SectionTitle>Record activity</SectionTitle>
                  {activity.data ? (
                    <ActivityList events={activity.data} me={user} empty="No activity yet." />
                  ) : (
                    <p className="text-muted text-sm">Loading…</p>
                  )}
                </Card>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function ReviewForm({ study }: { study: StudyDetail }) {
  const { data: meta } = useMeta();
  const client = useQueryClient();
  const navigate = useNavigate();
  const labels = meta?.analysis_types.find((t) => t.id === study.analysis_type)?.labels ?? [];
  const aiTop = study.predictions[0]?.label ?? "";
  const [choice, setChoice] = useState(aiTop);
  const [other, setOther] = useState("");
  const [impression, setImpression] = useState("");
  const [attested, setAttested] = useState(false);
  const finding = choice === OTHER ? other.trim() : choice;
  const valid = finding.length > 0 && impression.trim().length >= 10 && attested;

  const publish = useMutation({
    mutationFn: () => api.publishStudy(study.id, finding, impression.trim()),
    onSuccess: (updated) => {
      client.setQueryData(["study", study.id], updated);
      void client.invalidateQueries({ queryKey: ["studies"] });
      void client.invalidateQueries({ queryKey: ["my-patients"] });
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
      <SectionTitle>Your review</SectionTitle>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={publish.isPending} className="space-y-5">
          <Field id="finding" label="Final finding" hint={`AI suggestion: ${aiTop}`}>
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
          <Field
            id="impression"
            label="Impression"
            hint={`${impression.length}/${IMPRESSION_MAX}. Appears on the signed report.`}
          >
            <textarea
              id="impression"
              className={textareaClass}
              maxLength={IMPRESSION_MAX}
              rows={6}
              placeholder="Findings, interpretation and recommended next steps."
              value={impression}
              onChange={(event) => setImpression(event.target.value)}
            />
          </Field>
          <label className="text-ink flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-ink-strong mt-0.5 size-4 shrink-0"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
            I have reviewed the images and the AI findings, and this report reflects my clinical
            judgement.
          </label>
        </fieldset>
        <ErrorAlert error={publish.error ?? discard.error} />
        <Button type="submit" className="w-full" disabled={!valid} loading={publish.isPending}>
          {publish.isPending ? "Signing and publishing" : "Sign and publish"}
        </Button>
        {publish.isPending ? (
          <p className="text-muted text-xs leading-relaxed">
            Rendering the report, encrypting both files, storing them on IPFS and anchoring the
            record on-chain. This takes a few seconds.
          </p>
        ) : (
          <p className="text-muted text-xs leading-relaxed">
            Publishing gives {study.patient.name} the signed report and registers its fingerprint
            on-chain. It cannot be edited afterwards.
          </p>
        )}
        <div className="border-line border-t pt-4">
          <ConfirmButton
            variant="ghost"
            confirmLabel="Discard draft"
            loading={discard.isPending}
            onConfirm={() => discard.mutate()}
          >
            Discard draft
          </ConfirmButton>
        </div>
      </form>
    </Card>
  );
}
