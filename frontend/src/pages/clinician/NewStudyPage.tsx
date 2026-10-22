import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PatientFacts } from "../../components/Study";
import { ScanPicker } from "../../components/ScanPicker";
import {
  Badge,
  Button,
  Card,
  ErrorAlert,
  PageHeader,
  PersonLine,
  SectionTitle,
} from "../../components/ui";
import { cx, inputClass } from "../../components/ui/classes";
import { api, type AnalysisTypeId, type PatientOverview } from "../../lib/api";
import { validateScan } from "../../lib/files";
import { useMeta } from "../../lib/queries";
import { useObjectUrl } from "../../lib/useObjectUrl";

export function NewStudyPage() {
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const myPatients = useQuery({ queryKey: ["my-patients"], queryFn: api.myPatients });
  const preselected = myPatients.data?.find((p) => p.patient.id === params.get("patient")) ?? null;

  const [chosen, setChosen] = useState<PatientOverview | null>(null);
  const patient = chosen ?? preselected;
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const [analysisType, setAnalysisType] = useState<AnalysisTypeId>("brain_tumor");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreview] = useObjectUrl();
  const [fileError, setFileError] = useState<string>();

  const directory = useQuery({
    queryKey: ["patient-search", term],
    queryFn: () => api.searchPatients(term),
    enabled: !patient,
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!patient || !file) throw new Error("Choose a patient and a scan first.");
      return api.createStudy(patient.patient.id, analysisType, file);
    },
    onSuccess: (study) => {
      void client.invalidateQueries({ queryKey: ["studies"] });
      void navigate(`/studies/${study.id}`);
    },
  });

  function pickFile(next: File | null) {
    setFile(next);
    setPreview(next);
    setFileError(next && meta ? validateScan(next, meta.max_upload_mb) : undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setFileError("Choose a scan to analyse.");
    if (!fileError) create.mutate();
  }

  const ready = Boolean(patient && file && !fileError);

  return (
    <>
      <PageHeader
        title="New study"
        description="Choose the patient, the analysis and the scan. The AI runs in a few seconds; you then review it and sign the report."
      />
      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <SectionTitle>1. Patient</SectionTitle>
            {patient ? (
              <div className="border-line bg-subtle flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <PersonLine
                    name={patient.patient.name}
                    detail={
                      <PatientFacts
                        reference={patient.patient.reference}
                        dateOfBirth={patient.date_of_birth}
                      />
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChosen(null);
                    setParams({}, { replace: true });
                  }}
                  disabled={create.isPending}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <label htmlFor="patient-search" className="sr-only">
                  Search patients
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon
                    aria-hidden
                    weight="bold"
                    className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <input
                    id="patient-search"
                    className={`${inputClass} pl-9`}
                    placeholder="Search patients by name"
                    value={search}
                    autoComplete="off"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <ul className="divide-line mt-2 divide-y">
                  {directory.data?.map((option) => (
                    <li key={option.patient.id}>
                      <button
                        type="button"
                        onClick={() => setChosen(option)}
                        className="hover:bg-subtle flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
                      >
                        <PersonLine
                          name={option.patient.name}
                          detail={
                            <PatientFacts
                              reference={option.patient.reference}
                              dateOfBirth={option.date_of_birth}
                            />
                          }
                        />
                      </button>
                    </li>
                  ))}
                </ul>
                {directory.data?.length === 0 && (
                  <p className="text-muted py-2 text-sm">No patients match “{term}”.</p>
                )}
              </>
            )}
          </Card>

          <Card>
            <fieldset disabled={create.isPending}>
              <legend className="mb-4">
                <span className="text-ink-strong text-[15px] font-medium">2. Analysis</span>
              </legend>
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
                        onChange={() => setAnalysisType(type.id)}
                        className="sr-only"
                      />
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-ink-strong font-medium">{type.name}</span>
                        <Badge>{type.modality}</Badge>
                      </span>
                      <span className="text-muted mt-1 block text-sm">{type.description}</span>
                    </label>
                  );
                })}
              </div>
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
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <SectionTitle>Run analysis</SectionTitle>
            <p className="text-muted text-sm">
              The model classifies the scan and highlights the regions it relied on. Nothing is
              shared or published until you review and sign.
            </p>
            <div className="mt-5 space-y-3">
              <ErrorAlert error={create.error} />
              <Button type="submit" className="w-full" disabled={!ready} loading={create.isPending}>
                {create.isPending ? "Analysing scan" : "Analyse scan"}
              </Button>
            </div>
          </Card>
          {meta?.demo_accounts && (
            <p className="text-muted px-1 text-xs leading-relaxed">
              Demo tip: sample brain MRIs and chest X-rays are in the repository's{" "}
              <code className="font-mono">samples/</code> folder.
            </p>
          )}
        </aside>
      </form>
    </>
  );
}
