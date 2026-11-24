import { CheckCircleIcon, FlaskIcon, ImageIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useUser } from "../../auth/session";
import { PatientCell, PriorityBadge } from "../../components/Clinical";
import { LabEntry } from "../../components/Lab";
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
  type Discipline,
  type LabPanelId,
  type Patient,
  type Priority,
  type StudyDetail,
  type StudyType,
  type StudyTypeId,
} from "../../lib/api";
import { PRIORITY_LABEL } from "../../lib/clinical";
import { validateScan } from "../../lib/files";
import { LAB_PRESETS, flagFor, isCriticalFlag, labValues } from "../../lib/labs";
import { useMeta } from "../../lib/queries";
import { REPORTING_DISCIPLINE } from "../../lib/roles";
import { useObjectUrl } from "../../lib/useObjectUrl";

const PRIORITY_OPTIONS: { value: Priority; label: string; tone?: "bad" | "warn" }[] = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent", tone: "warn" },
  { value: "stat", label: "STAT", tone: "bad" },
];
const DISCIPLINE_OPTIONS: { value: Discipline; label: string }[] = [
  { value: "radiology", label: "Imaging" },
  { value: "laboratory", label: "Laboratory" },
];
const OUTSIDE = "__outside__";
const INDICATION_EXAMPLE: Record<Discipline, string> = {
  radiology: "Fever and cough for 5 days.",
  laboratory: "Fatigue and pallor for a month.",
};

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

  // Reporting doctors acquire for their own discipline; technicians for any.
  const ownDiscipline = REPORTING_DISCIPLINE[user.role];
  const types = (meta?.study_types ?? []).filter(
    (t) => !ownDiscipline || t.discipline === ownDiscipline,
  );
  const requested = params.get("type");
  const initialType: StudyTypeId =
    types.find((t) => t.id === requested)?.id ?? (types[0]?.id as StudyTypeId) ?? "chest_xray";

  const [chosen, setChosen] = useState<Patient | null>(null);
  const [registering, setRegistering] = useState(false);
  const patient = chosen ?? preselected.data ?? null;
  const [picked, setPicked] = useState<StudyTypeId | null>(null);
  const [priority, setPriority] = useState<Priority>("routine");
  const [siteId, setSiteId] = useState<string>("");
  const [referrer, setReferrer] = useState("");
  const [outsideName, setOutsideName] = useState("");
  const [indication, setIndication] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreview] = useObjectUrl();
  const [fileError, setFileError] = useState<string>();
  const [results, setResults] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<StudyDetail | null>(null);
  const site = siteId || user.site?.id || sites.data?.[0]?.id || "";
  const typeId = picked ?? initialType;
  const type = types.find((t) => t.id === typeId);
  const discipline: Discipline = type?.discipline ?? ownDiscipline ?? "radiology";
  const lab = discipline === "laboratory";
  const sex = patient?.sex ?? null;
  const flags = (type?.analytes ?? []).map((a) => flagFor(a, results[a.code], sex));
  const resultsComplete = lab && flags.length > 0 && flags.every((f) => f !== null);

  const loadSample = useMutation({ mutationFn: api.demoSampleFile, onSuccess: pickFile });
  const create = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error("Choose a patient first.");
      const order = {
        patient_id: patient.id,
        priority,
        site_id: site || undefined,
        indication: indication.trim() || undefined,
        referrer_id: referrer && referrer !== OUTSIDE ? referrer : undefined,
        referrer_name: referrer === OUTSIDE ? outsideName.trim() || undefined : undefined,
      };
      if (lab && type) {
        return api.createLabStudy({
          ...order,
          panel: type.id as LabPanelId,
          values: labValues(type.analytes, results),
        });
      }
      if (!file) throw new Error("Add the scan for this study.");
      return api.createStudy({ ...order, analysis_type: typeId, file });
    },
    onSuccess: (study) => {
      void client.invalidateQueries({ queryKey: ["studies"] });
      if (ownDiscipline) void navigate(`/studies/${study.id}`);
      else setCreated(study);
    },
  });

  function pickFile(next: File | null) {
    setFile(next);
    setPreview(next);
    setFileError(next && meta ? validateScan(next, meta.max_upload_mb) : undefined);
  }

  function pickType(next: StudyType) {
    setPicked(next.id);
    setResults({});
    if (file?.name && samples.data?.samples.some((s) => s.file === file.name)) pickFile(null);
  }

  function reset() {
    setCreated(null);
    setChosen(null);
    setParams({}, { replace: true });
    setPriority("routine");
    setReferrer("");
    setOutsideName("");
    setIndication("");
    setResults({});
    pickFile(null);
    create.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (lab) {
      if (resultsComplete) create.mutate();
      return;
    }
    if (!file) return setFileError("Add the scan for this study.");
    if (!fileError) create.mutate();
  }

  if (created) return <Sent study={created} onAnother={reset} />;

  const matchingSamples = samples.data?.samples.filter((s) => s.analysis_type === typeId);
  const presets = lab && meta?.demo ? LAB_PRESETS[typeId as LabPanelId] : undefined;
  const ready = Boolean(patient && (lab ? resultsComplete : file && !fileError));
  const flagged = flags.filter(Boolean).length;
  const critical = flags.some((f) => f !== null && isCriticalFlag(f));

  return (
    <>
      <PageHeader
        title="New study"
        description="Find or register the patient, choose the test, then add the scan or enter the results. Scans get an AI pre-read and lab results flag themselves; either way the study joins the reporting worklist."
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
              {!ownDiscipline && (
                <Segmented
                  name="discipline"
                  label="Department"
                  value={discipline}
                  options={DISCIPLINE_OPTIONS}
                  onChange={(next) => {
                    const first = types.find((t) => t.discipline === next);
                    if (first) pickType(first);
                  }}
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {types
                  .filter((t) => t.discipline === discipline)
                  .map((option) => {
                    const selected = typeId === option.id;
                    return (
                      <label
                        key={option.id}
                        className={cx(
                          "cursor-pointer rounded-lg border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                          selected ? "border-ink-strong bg-subtle" : "border-line hover:bg-subtle",
                        )}
                      >
                        <input
                          type="radio"
                          name="study-type"
                          value={option.id}
                          checked={selected}
                          onChange={() => pickType(option)}
                          className="sr-only"
                        />
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-ink-strong font-medium">
                            {option.ai ? option.modality : option.name}
                          </span>
                          <Badge>{option.ai ? `AI: ${option.name}` : "Auto-flagged"}</Badge>
                        </span>
                        <span className="text-muted mt-1 block text-sm">{option.description}</span>
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
                    <option value={OUTSIDE}>Outside doctor or organisation…</option>
                  </Select>
                </Field>
                {referrer === OUTSIDE && (
                  <Field id="outside-doctor" label="Referred by">
                    <input
                      id="outside-doctor"
                      required
                      placeholder={
                        lab ? "Pre-employment screening" : "Dr. R. K. Singh (Singh Clinic)"
                      }
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
                  placeholder={INDICATION_EXAMPLE[discipline]}
                  value={indication}
                  onChange={(event) => setIndication(event.target.value)}
                />
              </Field>
            </fieldset>
          </Card>

          {lab && type ? (
            <Card>
              <SectionTitle
                action={
                  !patient?.sex && (
                    <span className="text-muted text-xs">
                      Choose the patient for sex-specific intervals
                    </span>
                  )
                }
              >
                3. Results
              </SectionTitle>
              <LabEntry
                analytes={type.analytes}
                sex={sex}
                values={results}
                disabled={create.isPending}
                onChange={(code, value) => setResults((current) => ({ ...current, [code]: value }))}
              />
              {presets && (
                <div className="mt-4">
                  <p className="text-muted text-xs">Demo: fill in a sample result.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="secondary"
                        size="sm"
                        disabled={create.isPending}
                        icon={<FlaskIcon aria-hidden weight="bold" className="size-3.5" />}
                        onClick={() => setResults(preset.values)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : (
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
                    No scan to hand? Use a sample {type?.modality}:
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
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <dl className="divide-line divide-y text-sm">
              <SummaryRow
                label="Patient"
                value={patient ? `${patient.name} · ${patient.uhid}` : "Not chosen"}
              />
              <SummaryRow label="Study" value={type ? (lab ? type.name : type.modality) : ""} />
              <SummaryRow label="Priority" value={<PriorityBadge priority={priority} />} />
              <SummaryRow
                label="Referred by"
                value={
                  referrer === OUTSIDE
                    ? outsideName || "Outside referral"
                    : (doctors.data?.find((d) => d.id === referrer)?.name ?? "Self / walk-in")
                }
              />
              {lab && (
                <SummaryRow
                  label="Flagged"
                  value={
                    <span className={cx(critical && "text-bad font-medium")}>
                      {flagged} of {flags.length}
                      {critical ? " · critical" : ""}
                    </span>
                  }
                />
              )}
            </dl>
            <div className="mt-5 space-y-3">
              <ErrorAlert error={create.error} />
              <Button type="submit" className="w-full" disabled={!ready} loading={create.isPending}>
                {create.isPending
                  ? lab
                    ? "Flagging the results"
                    : "Running the AI pre-read"
                  : ownDiscipline
                    ? lab
                      ? "Save and report"
                      : "Analyse and report"
                    : lab
                      ? "Send to the pathologist"
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
  const lab = study.discipline === "laboratory";
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <CheckCircleIcon aria-hidden weight="fill" className="text-ok mx-auto size-12" />
      <h1 className="text-ink-strong mt-4 font-serif text-4xl tracking-[-0.02em]">
        Sent for reporting
      </h1>
      <p className="text-muted mt-3">
        The {lab ? study.analysis_name.toLowerCase() : study.modality} for {study.patient.name} is
        on the {lab ? "pathologist's" : "radiologists'"} worklist as{" "}
        <span className="text-ink-strong font-mono whitespace-nowrap">{study.accession}</span>.{" "}
        {lab
          ? "Values outside the reference intervals are flagged."
          : "The AI pre-read is complete."}
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
