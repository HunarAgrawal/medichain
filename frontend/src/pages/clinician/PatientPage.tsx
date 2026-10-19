import { ArrowLeftIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { PatientFacts } from "../../components/Study";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageError,
  PageHeader,
  PageLoading,
  StudyStatusBadge,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";

export function PatientPage() {
  const { id = "" } = useParams();
  const patients = useQuery({ queryKey: ["my-patients"], queryFn: api.myPatients });
  const studies = useQuery({
    queryKey: ["studies", "patient", id],
    queryFn: () => api.studies({ patient_id: id }),
  });
  const row = patients.data?.find((p) => p.patient.id === id);

  if (patients.isPending) return <PageLoading />;
  if (patients.error)
    return <PageError error={patients.error} onRetry={() => void patients.refetch()} />;
  if (!row) {
    return (
      <EmptyState
        title="Patient not available"
        action={
          <ButtonLink to="/patients" variant="secondary">
            All patients
          </ButtonLink>
        }
      >
        You can only see patients you have reported on or who shared their records with you.
      </EmptyState>
    );
  }

  return (
    <>
      <Link
        to="/patients"
        className="text-muted hover:text-ink-strong mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon aria-hidden weight="bold" className="size-3.5" /> Patients
      </Link>
      <PageHeader
        title={row.patient.name}
        description={
          <PatientFacts reference={row.patient.reference} dateOfBirth={row.date_of_birth} />
        }
        eyebrow={
          row.shared_with_me ? (
            <Badge tone="info">Shared with you</Badge>
          ) : (
            <Badge>Your reports</Badge>
          )
        }
        action={
          <ButtonLink
            to={`/studies/new?patient=${row.patient.id}`}
            icon={<PlusIcon aria-hidden weight="bold" className="size-4" />}
          >
            New study
          </ButtonLink>
        }
      />
      {studies.error && <PageError error={studies.error} onRetry={() => void studies.refetch()} />}
      {studies.data?.length === 0 && (
        <EmptyState title="No studies yet">
          Start a study to analyse a scan for this patient.
        </EmptyState>
      )}
      {studies.data && studies.data.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Study</Th>
              <Th>Finding</Th>
              <Th>Reported by</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {studies.data.map((study) => (
              <tr key={study.id} className="group hover:bg-subtle/60">
                <Td>
                  <Link
                    to={`/studies/${study.id}`}
                    className="text-ink-strong font-medium underline-offset-4 hover:underline"
                  >
                    {study.analysis_name}
                  </Link>
                  <span className="text-muted block text-xs">{study.modality}</span>
                </Td>
                <Td className="text-ink-strong">{study.top_finding ?? "—"}</Td>
                <Td className="text-muted">{study.clinician.name}</Td>
                <Td>
                  <StudyStatusBadge status={study.status} />
                </Td>
                <Td className="text-muted whitespace-nowrap">
                  {formatDate(study.published_at ?? study.created_at)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
