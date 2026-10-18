import type { FormEvent } from "react";

import { Alert, Badge, Button, Card, Field, inputClass } from "../../components/ui";
import type { AnalysisType } from "../../lib/api";
import { ScanPicker } from "./ScanPicker";
import type { AnalysisDraft, DraftErrors } from "./validation";

interface AnalysisFormProps {
  draft: AnalysisDraft;
  errors: DraftErrors;
  analysisTypes: AnalysisType[];
  maxUploadMb: number;
  previewUrl: string | null;
  busy: boolean;
  error?: string;
  onChange: (patch: Partial<AnalysisDraft>) => void;
  onSubmit: () => void;
}

export function AnalysisForm({
  draft,
  errors,
  analysisTypes,
  maxUploadMb,
  previewUrl,
  busy,
  error,
  onChange,
  onSubmit,
}: AnalysisFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  const describedBy = (field: keyof DraftErrors) =>
    errors[field] ? `${field}-message` : undefined;

  return (
    <Card>
      <form noValidate onSubmit={submit} className="space-y-8">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="text-ink-strong mb-3 text-sm font-medium">Analysis</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {analysisTypes.map((type) => {
              const selected = draft.analysisType === type.id;
              return (
                <label
                  key={type.id}
                  className={`relative cursor-pointer rounded-lg border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
                    selected ? "border-ink-strong bg-subtle" : "border-line hover:bg-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    name="analysisType"
                    value={type.id}
                    checked={selected}
                    onChange={() => onChange({ analysisType: type.id })}
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

        <fieldset disabled={busy} className="border-line space-y-4 border-t pt-8">
          <legend className="text-ink-strong float-left mb-4 w-full text-sm font-medium">
            Patient
          </legend>
          <Field
            id="patientId"
            label="Patient ID"
            hint="Use a pseudonymous ID. It is stored on-chain in plain text."
            error={errors.patientId}
          >
            <input
              id="patientId"
              className={`${inputClass} font-mono`}
              value={draft.patientId}
              placeholder="MRI-2026-0142"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              aria-invalid={Boolean(errors.patientId)}
              aria-describedby="patientId-message"
              onChange={(event) => onChange({ patientId: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field id="patientName" label="Name" error={errors.patientName}>
              <input
                id="patientName"
                className={inputClass}
                value={draft.patientName}
                placeholder="Priya Raman"
                autoComplete="off"
                maxLength={100}
                aria-invalid={Boolean(errors.patientName)}
                aria-describedby={describedBy("patientName")}
                onChange={(event) => onChange({ patientName: event.target.value })}
              />
            </Field>
            <Field id="patientAge" label="Age" error={errors.patientAge}>
              <input
                id="patientAge"
                className={`${inputClass} tabular-nums`}
                value={draft.patientAge}
                inputMode="numeric"
                placeholder="54"
                maxLength={3}
                aria-invalid={Boolean(errors.patientAge)}
                aria-describedby={describedBy("patientAge")}
                onChange={(event) =>
                  onChange({ patientAge: event.target.value.replace(/\D/g, "") })
                }
              />
            </Field>
          </div>
        </fieldset>

        <fieldset disabled={busy} className="border-line border-t pt-8">
          <legend className="text-ink-strong float-left mb-3 w-full text-sm font-medium">
            Scan
          </legend>
          <ScanPicker
            file={draft.file}
            previewUrl={previewUrl}
            maxUploadMb={maxUploadMb}
            error={errors.file}
            disabled={busy}
            onChange={(file) => onChange({ file })}
          />
        </fieldset>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="border-line flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted text-xs">
            Your wallet will ask you to approve one transaction after the analysis.
          </p>
          <Button type="submit" loading={busy}>
            {busy ? "Analyzing scan" : "Analyze scan"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
