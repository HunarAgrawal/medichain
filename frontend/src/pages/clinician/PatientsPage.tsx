import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import {
  Badge,
  EmptyState,
  PageError,
  PageHeader,
  PersonLine,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";
import { age, formatDate } from "../../lib/format";

export function PatientsPage() {
  const patients = useQuery({ queryKey: ["my-patients"], queryFn: api.myPatients });

  return (
    <>
      <PageHeader
        title="Patients"
        description="Patients you have reported on, and patients who have shared their records with you."
      />
      {patients.isPending && <Skeleton className="h-40 rounded-xl" />}
      {patients.error && (
        <PageError error={patients.error} onRetry={() => void patients.refetch()} />
      )}
      {patients.data?.length === 0 && (
        <EmptyState title="No patients yet">
          Patients appear here once you publish a study for them or they share their records with
          you.
        </EmptyState>
      )}
      {patients.data && patients.data.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Date of birth</Th>
              <Th>Access</Th>
              <Th>Signed reports</Th>
              <Th>Latest</Th>
            </tr>
          </thead>
          <tbody>
            {patients.data.map((row) => (
              <tr key={row.patient.id} className="group hover:bg-subtle/60">
                <Td>
                  <Link to={`/patients/${row.patient.id}`} className="block">
                    <PersonLine name={row.patient.name} detail={row.patient.reference} size="sm" />
                  </Link>
                </Td>
                <Td className="text-muted whitespace-nowrap">
                  {row.date_of_birth
                    ? `${formatDate(row.date_of_birth)} (${age(row.date_of_birth)})`
                    : "—"}
                </Td>
                <Td>
                  {row.shared_with_me ? (
                    <Badge tone="info">Shared with you</Badge>
                  ) : (
                    <Badge>Your reports</Badge>
                  )}
                </Td>
                <Td className="tabular-nums">{row.published_studies}</Td>
                <Td className="text-muted whitespace-nowrap">
                  {row.last_study_at ? formatDate(row.last_study_at) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
