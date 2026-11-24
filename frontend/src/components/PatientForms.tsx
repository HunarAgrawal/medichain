/** Patient registration and registry search, shared by the front desk and new-study screens. */

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";

import { api, type NewPatient, type Patient, type Sex } from "../lib/api";
import { ageSex, formatPhone } from "../lib/clinical";
import { Button, ErrorAlert, Field, Segmented, Skeleton } from "./ui";
import { inputClass } from "./ui/classes";

const SEXES: { value: Sex; label: string }[] = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
  { value: "O", label: "Other" },
];

/** Date of birth for someone of `years` today, when only the age is known. */
function birthDateForAge(years: number, today = new Date()): string {
  const born = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
  return born.toISOString().slice(0, 10);
}

export function RegisterPatientForm({
  onRegistered,
  onCancel,
}: {
  onRegistered: (patient: Patient) => void;
  onCancel?: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("F");
  const [byAge, setByAge] = useState(true);
  const [age, setAge] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [abha, setAbha] = useState("");

  const register = useMutation({
    mutationFn: (body: NewPatient) => api.registerPatient(body),
    onSuccess: (patient) => {
      void client.invalidateQueries({ queryKey: ["patients"] });
      onRegistered(patient);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const years = Number(age);
    register.mutate({
      name: name.trim(),
      sex,
      date_of_birth: byAge ? birthDateForAge(years) : dob,
      phone: phone.trim() || undefined,
      abha_number: abha.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={register.isPending} className="space-y-4">
        <Field id="patient-name" label="Full name">
          <input
            id="patient-name"
            required
            autoComplete="off"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-ink-strong block text-sm font-medium">Sex</span>
            <Segmented
              name="patient-sex"
              label="Sex"
              value={sex}
              options={SEXES}
              onChange={setSex}
            />
          </div>
          {byAge ? (
            <Field
              id="patient-age"
              label="Age (years)"
              hint={
                <button type="button" className="underline" onClick={() => setByAge(false)}>
                  Enter the date of birth instead
                </button>
              }
            >
              <input
                id="patient-age"
                type="number"
                min={0}
                max={120}
                required
                inputMode="numeric"
                className={inputClass}
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </Field>
          ) : (
            <Field
              id="patient-dob"
              label="Date of birth"
              hint={
                <button type="button" className="underline" onClick={() => setByAge(true)}>
                  Only know the age?
                </button>
              }
            >
              <input
                id="patient-dob"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                className={inputClass}
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="patient-phone" label="Mobile number" hint="Optional">
            <input
              id="patient-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Field id="patient-abha" label="ABHA number" hint="Optional · 14 digits">
            <input
              id="patient-abha"
              autoComplete="off"
              placeholder="12-3456-7890-1234"
              className={inputClass}
              value={abha}
              onChange={(event) => setAbha(event.target.value)}
            />
          </Field>
        </div>
      </fieldset>
      <ErrorAlert error={register.error} />
      <div className="flex gap-2">
        <Button type="submit" loading={register.isPending}>
          Register patient
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={register.isPending}>
            Cancel
          </Button>
        )}
      </div>
      <p className="text-muted text-xs">A UHID is issued automatically.</p>
    </form>
  );
}

export function PatientSearch({ onPick }: { onPick: (patient: Patient) => void }) {
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const results = useQuery({
    queryKey: ["patients", term],
    queryFn: () => api.patients(term, 8),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
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
          placeholder="Search by name, UHID or mobile number"
          value={search}
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {results.isPending ? (
        <Skeleton className="mt-3 h-24" />
      ) : (
        <ul className="divide-line mt-2 divide-y">
          {results.data?.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => onPick(patient)}
                className="hover:bg-subtle flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-ink-strong block truncate text-sm font-medium">
                    {patient.name}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {patient.uhid} · {ageSex(patient)}
                    {patient.phone ? ` · ${formatPhone(patient.phone)}` : ""}
                  </span>
                </span>
                <span className="text-muted shrink-0 text-xs">
                  {patient.studies} {patient.studies === 1 ? "study" : "studies"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.data?.length === 0 && (
        <p className="text-muted py-3 text-sm">
          {term ? `No patients match “${term}”.` : "No patients registered yet."}
        </p>
      )}
    </div>
  );
}
