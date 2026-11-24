import { CheckCircleIcon, ImageIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useUser } from "../../auth/session";
import { PatientCell, PriorityBadge } from "../../components/Clinical";
import { PatientSearch, RegisterPatientForm } from "../../components/PatientForms";
import { ScanPicker } from "../../components/ScanPicker";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ErrorAlert,
  Field,
  PageHeader,
  SectionTitle,
  Segmented,
  Select,
} from "../../components/ui";
import { cx, inputClass, textareaClass } from "../../components/ui/classes";
import {
  api,
  type AnalysisTypeId,
  type Patient,
  type Priority,
  type StudyDetail,
} from "../../lib/api";
import { PRIORITY_LABEL } from "../../lib/clinical";
import { validateScan } from "../../lib/files";
import { useMeta } from "../../lib/queries";
import { useObjectUrl } from "../../lib/useObjectUrl";

const PRIORITY_OPTIONS: { value: Priority; label: string; tone?: "bad" | "warn" }[] = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent", tone: "warn" },
  { value: "stat", label: "STAT", tone: "bad" },
];
const OUTSIDE = "__outside__";

export function NewStudyPage() {
  const user = useUser();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const preselectedId = params.get("patient");
  const preselected = useQuery({
    queryKey: ["patient", preselectedId],
    queryFn: () => api.patient(preselectedId ?? ""),
    enabled: Boolean(preselectedId),
  });
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const doctors = useQuery({
    queryKey: ["clinicians", "doctor"],
    queryFn: () => api.clinicians({ role: "doctor" }),
  });
  const samples = useQuery({
    queryKey: ["demo-samples"],
    queryFn: api.demoSamples,
    enabled: Boolean(meta?.demo),
  });

  const [chosen, setChosen] = useState<Patient | null>(null);
  const [registering, setRegistering] = useState(false);
  const patient = chosen ?? preselected.data ?? null;
  const [analysisType, setAnalysisType] = useState<AnalysisTypeId>("chest_xray");
  const [priority, setPriority] = useState<Priority>("routine");
  const [siteId, setSiteId] = useState<string>("");
  const [referrer, setReferrer] = useState("");
  const [outsideName, setOutsideName] = useState("");
  const [indication, setIndication] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreview] = useObjectUrl();
  const [fileError, setFileError] = useState<string>();
  const [created, setCreated] = useState<StudyDetail | null>(null);
  const site = siteId || user.site?.id || sites.data?.[0]?.id || "";

  const loadSample = useMutation({ mutationFn: api.demoSampleFile, onSuccess: pickFile });
  const create = useMutation({
    mutationFn: () => {
      if (!patient || !file) throw new Error("Choose a patient and a scan first.");
      return api.createStudy({
        patient_id: patient.id,
        analysis_type: analysisType,
        priority,
        site_id: site || undefined,
        indication: indication.trim() || undefined,
        referrer_id: referrer && referrer !== OUTSIDE ? referrer : undefined,
        referrer_name: referrer === OUTSIDE ? outsideName.trim() || undefined : undefined,
        file,
      });
    },
    onSuccess: (study) => {
      void client.invalidateQueries({ queryKey: ["studies"] });
      if (user.role === "radiologist") void navigate(`/studies/${study.id}`);
      else setCreated(study);
    },
  });

  function pickFile(next: File | null) {
    setFile(next);
    setPreview(next);
    setFileError(next && meta ? validateScan(next, meta.max_upload_mb) : undefined);
  }

  function reset() {
    setCreated(null);
    setChosen(null);
    setParams({}, { replace: true });
    setPriority("routine");
    setReferrer("");
    setOutsideName("");
    setIndication("");
    pickFile(null);
    create.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setFileError("Add the scan for this study.");
    if (!fileError) create.mutate();
  }

  if (created) return <Sent study={created} onAnother={reset} />;

  const analysis = meta?.analysis_types.find((t) => t.id === analysisType);
  const matchingSamples = samples.data?.samples.filter((s) => s.analysis_type === analysisType);
  const ready = Boolean(patient && file && !fileError);

  return (
    <>
      <PageHeader
        title="New study"
        description="Register or find the patient, describe the study and add the scan. The AI pre-read runs in seconds and the study joins the reporting worklist."
      />
      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <SectionTitle
              action={
                !patient && (
                  <Button variant="ghost" size="sm" onClick={() => setRegistering((v) => !v)}>
                    {registering ? "Find an existing patient" : "Register a new patient"}
                  </Button>
                )
              }
            >
              1. Patient
            </SectionTitle>
            {patient ? (
              <div className="border-line bg-subtle flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <PatientCell patient={patient} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => {
                    setChosen(null);
                    setParams({}, { replace: true });
                  }}
                >
                  Change
                </Button>
              </div>
            ) : registering ? (
              <RegisterPatientForm
                onRegistered={(registered) => {
                  setChosen(registered);
                  setRegistering(false);
                }}
                onCancel={() => setRegistering(false)}
              />
            ) : (
              <PatientSearch onPick={setChosen} />
            )}
          </Card>

          <Card>
            <fieldset disabled={create.isPending} className="space-y-6">
              <legend className="text-ink-strong mb-4 text-[15px] font-medium">2. Study</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {meta?.analysis_types.map((type) => {
                  const selected = analysisType === type.id;
                  return (
                    <label
                      key={type.id}
                      className={cx(
                        "cursor-pointer rounded-lg border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                        selected ? "border-ink-strong bg-subtle" : "border-line hover:bg-subtle",
                      )}
                    >
                      <input
                        type="radio"
                        name="analysis"
                        value={type.id}
                        checked={selected}
                        onChange={() => {
                          setAnalysisType(type.id);
                          if (file?.name && samples.data?.samples.some((s) => s.file === file.name))
                            pickFile(null);
                        }}
                        className="sr-only"
                      />
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-ink-strong font-medium">{type.modality}</span>
                        <Badge>AI: {type.name}</Badge>
                      </span>
                      <span className="text-muted mt-1 block text-sm">{type.description}</span>
                    </label>
                  );
                })}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="text-ink-strong block text-sm font-medium">Priority</span>
                  <Segmented
                    name="priority"
                    label="Priority"
                    value={priority}
                    options={PRIORITY_OPTIONS}
                    onChange={setPriority}
                  />
                </div>
                <Field id="site" label="Site">
                  <Select
                    id="site"
                    value={site}
                    onChange={(event) => setSiteId(event.target.value)}
                  >
                    {sites.data?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="referrer" label="Referring doctor">
                  <Select
                    id="referrer"
                    value={referrer}
                    onChange={(event) => setReferrer(event.target.value)}
                  >
                    <option value="">Self-referred / walk-in</option>
                    {doctors.data?.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                        {doctor.title ? ` · ${doctor.title}` : ""}
                      </option>
                    ))}
                    <option value={OUTSIDE}>Outside doctor…</option>
                  </Select>
                </Field>
                {referrer === OUTSIDE && (
                  <Field id="outside-doctor" label="Outside doctor's name">
                    <input
                      id="outside-doctor"
                      required
                      placeholder="Dr. R. K. Singh (Singh Clinic)"
                      className={inputClass}
                      value={outsideName}
                      onChange={(event) => setOutsideName(event.target.value)}
                    />
                  </Field>
                )}
              </div>
              <Field id="indication" label="Clinical indication" hint="Printed on the report.">
                <textarea
                  id="indication"
                  maxLength={300}
                  rows={2}
                  className={cx(textareaClass, "min-h-20")}
                  placeholder="Fever and cough for 5 days."
                  value={indication}
                  onChange={(event) => setIndication(event.target.value)}
                />
              </Field>
            </fieldset>
          </Card>

          <Card>
            <SectionTitle>3. Scan</SectionTitle>
            <ScanPicker
              file={file}
              previewUrl={previewUrl}
              maxUploadMb={meta?.max_upload_mb ?? 10}
              error={fileError}
              disabled={create.isPending}
              onChange={pickFile}
            />
            {matchingSamples && matchingSamples.length > 0 && !file && (
              <div className="mt-4">
                <p className="text-muted text-xs">
                  No scan to hand? Use a sample {analysis?.modality}:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {matchingSamples.map((sample) => (
                    <Button
                      key={sample.file}
                      variant="secondary"
                      size="sm"
                      icon={<ImageIcon aria-hidden weight="bold" className="size-3.5" />}
                      loading={loadSample.isPending && loadSample.variables === sample.file}
                      onClick={() => loadSample.mutate(sample.file)}
                    >
                      {sample.label}
                    </Button>
                  ))}
                </div>
                <p className="text-muted mt-2 text-[11px]">{samples.data?.attribution}</p>
                <ErrorAlert error={loadSample.error} />
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <dl className="divide-line divide-y text-sm">
              <SummaryRow
                label="Patient"
                value={patient ? `${patient.name} · ${patient.uhid}` : "Not chosen"}
              />
              <SummaryRow label="Study" value={analysis?.modality ?? ""} />
              <SummaryRow label="Priority" value={<PriorityBadge priority={priority} />} />
              <SummaryRow
                label="Referred by"
                value={
                  referrer === OUTSIDE
                    ? outsideName || "Outside doctor"
                    : (doctors.data?.find((d) => d.id === referrer)?.name ?? "Self / walk-in")
                }
              />
            </dl>
            <div className="mt-5 space-y-3">
              <ErrorAlert error={create.error} />
              <Button type="submit" className="w-full" disabled={!ready} loading={create.isPending}>
                {create.isPending
                  ? "Running the AI pre-read"
                  : user.role === "radiologist"
                    ? "Analyse and report"
                    : "Send for reporting"}
              </Button>
              <p className="text-muted text-xs">
                {PRIORITY_LABEL[priority]} studies are tracked against a{" "}
                {priority === "stat" ? "60-minute" : priority === "urgent" ? "4-hour" : "24-hour"}{" "}
                reporting target.
              </p>
            </div>
          </Card>
        </aside>
      </form>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink-strong min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

function Sent({ study, onAnother }: { study: StudyDetail; onAnother: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <CheckCircleIcon aria-hidden weight="fill" className="text-ok mx-auto size-12" />
      <h1 className="text-ink-strong mt-4 font-serif text-4xl tracking-[-0.02em]">
        Sent for reporting
      </h1>
      <p className="text-muted mt-3">
        The {study.modality} for {study.patient.name} is on the radiologists' worklist as{" "}
        <span className="text-ink-strong font-mono whitespace-nowrap">{study.accession}</span>. The
        AI pre-read is complete.
      </p>
      <div className="mt-3 flex justify-center">
        <PriorityBadge priority={study.priority} />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={onAnother}>Start another study</Button>
        <ButtonLink to="/desk" variant="secondary">
          Back to today
        </ButtonLink>
        <Link
          to={`/patients/${study.patient.id}`}
          className="text-muted self-center text-sm underline"
        >
          Patient record
        </Link>
      </div>
    </div>
  );
}
