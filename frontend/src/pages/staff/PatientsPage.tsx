import { MagnifyingGlassIcon, UserPlusIcon } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useUser } from "../../auth/session";
import { RegisterPatientForm } from "../../components/PatientForms";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageError,
  PageHeader,
  SectionTitle,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { inputClass } from "../../components/ui/classes";
import { api } from "../../lib/api";
import { ageSex, formatPhone, maskAbha } from "../../lib/clinical";
import { timeAgo } from "../../lib/format";
import { isReporter } from "../../lib/roles";

export function PatientsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canRegister = user.role === "technician" || isReporter(user.role);
  const registering = canRegister && params.get("register") === "1";
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const patients = useQuery({
    queryKey: ["patients", term, "list"],
    queryFn: () => api.patients(term, 50),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={user.role === "doctor" ? "Your patients" : "Patients"}
        description={
          user.role === "doctor"
            ? "Patients you referred, and patients who shared their records with you."
            : "The hospital's patient registry. Search by name, UHID or mobile number."
        }
        action={
          canRegister &&
          !registering && (
            <Button
              icon={<UserPlusIcon aria-hidden weight="bold" className="size-4" />}
              onClick={() => setParams({ register: "1" })}
            >
              Register patient
            </Button>
          )
        }
      />

      {registering && (
        <Card className="mb-8 max-w-3xl">
          <SectionTitle>Register a patient</SectionTitle>
          <RegisterPatientForm
            onRegistered={(patient) => void navigate(`/patients/${patient.id}?registered=1`)}
            onCancel={() => setParams({})}
          />
        </Card>
      )}

      <div className="relative mb-4 max-w-md">
        <label htmlFor="registry-search" className="sr-only">
          Search patients
        </label>
        <MagnifyingGlassIcon
          aria-hidden
          weight="bold"
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          id="registry-search"
          className={`${inputClass} pl-9`}
          placeholder="Name, UHID or mobile number"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {patients.isError ? (
        <PageError error={patients.error} onRetry={() => void patients.refetch()} />
      ) : patients.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : patients.data.length === 0 ? (
        <EmptyState title={term ? `No patients match “${term}”` : "No patients yet"}>
          {user.role === "doctor"
            ? "Patients appear here when you refer them or they share their records with you."
            : "Registered patients appear here."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Age · Sex</Th>
              <Th>Mobile</Th>
              <Th>ABHA</Th>
              <Th className="text-right">Studies</Th>
              <Th>Last study</Th>
              <Th>Portal</Th>
            </tr>
          </thead>
          <tbody>
            {patients.data.map((patient) => (
              <tr key={patient.id} className="group hover:bg-subtle">
                <Td>
                  <Link to={`/patients/${patient.id}`} className="block">
                    <span className="text-ink-strong block text-sm font-medium">
                      {patient.name}
                    </span>
                    <span className="text-muted block text-xs">{patient.uhid}</span>
                  </Link>
                </Td>
                <Td className="text-sm">{ageSex(patient)}</Td>
                <Td className="text-muted text-sm whitespace-nowrap">
                  {formatPhone(patient.phone)}
                </Td>
                <Td className="text-muted font-mono text-xs">{maskAbha(patient.abha_number)}</Td>
                <Td className="text-right tabular-nums">{patient.studies}</Td>
                <Td className="text-muted text-sm whitespace-nowrap">
                  {patient.last_study_at ? timeAgo(patient.last_study_at) : "–"}
                </Td>
                <Td>{patient.portal_access ? <Badge tone="ok">Active</Badge> : null}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
