import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { useUser } from "../../auth/session";
import { CriticalBadge, PriorityBadge, StatusBadge } from "../../components/Clinical";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CopyButton,
  DetailList,
  EmptyState,
  ErrorAlert,
  Field,
  PageError,
  PageHeader,
  PageLoading,
  SectionTitle,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { inputClass } from "../../components/ui/classes";
import { api, type Patient } from "../../lib/api";
import { SEX_LABEL, formatPhone, maskAbha } from "../../lib/clinical";
import { formatDate, formatDateTime } from "../../lib/format";
import { isReporter } from "../../lib/roles";

export function PatientPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const [params] = useSearchParams();
  const patient = useQuery({ queryKey: ["patient", id], queryFn: () => api.patient(id) });
  const studies = useQuery({
    queryKey: ["studies", "patient", id],
    queryFn: () => api.studies({ patient_id: id, limit: 100 }),
  });
  const acquires = user.role === "technician" || isReporter(user.role);

  if (patient.isPending) return <PageLoading />;
  if (patient.isError)
    return <PageError error={patient.error} onRetry={() => void patient.refetch()} />;
  const p = patient.data;

  return (
    <>
      {params.get("registered") && (
        <div className="mb-6">
          <Alert tone="success">
            {p.name} is registered with UHID <strong>{p.uhid}</strong>.
          </Alert>
        </div>
      )}
      <PageHeader
        eyebrow={<Link to="/patients">← Patients</Link>}
        title={p.name}
        description={`${p.uhid}${p.age !== null ? ` · ${p.age} years` : ""}${p.sex ? ` · ${SEX_LABEL[p.sex]}` : ""}`}
        action={
          acquires && (
            <ButtonLink
              to={`/studies/new?patient=${p.id}`}
              icon={<PlusIcon aria-hidden weight="bold" className="size-4" />}
            >
              New study
            </ButtonLink>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <SectionTitle>Studies</SectionTitle>
          {studies.isError ? (
            <PageError error={studies.error} />
          ) : !studies.data || studies.data.length === 0 ? (
            <EmptyState title="No studies yet">
              {acquires ? "Start a study to send this patient's scan for reporting." : null}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Study</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Finding</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {studies.data.map((study) => (
                  <tr key={study.id} className="group hover:bg-subtle">
                    <Td>
                      <Link to={`/studies/${study.id}`} className="block">
                        <span className="text-ink-strong block text-sm font-medium">
                          {study.modality}
                        </span>
                        <span className="text-muted block text-xs">{study.accession}</span>
                      </Link>
                    </Td>
                    <Td>
                      <PriorityBadge priority={study.priority} />
                    </Td>
                    <Td>
                      <StatusBadge study={study} />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2 text-sm">
                        {study.top_finding ?? <span className="text-muted">–</span>}
                        {study.critical && <CriticalBadge />}
                      </span>
                    </Td>
                    <Td className="text-muted text-sm whitespace-nowrap">
                      {formatDateTime(study.published_at ?? study.created_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <SectionTitle>Details</SectionTitle>
            <DetailList
              items={[
                { label: "UHID", value: p.uhid, copy: true },
                ...(p.date_of_birth ? [{ label: "Born", value: formatDate(p.date_of_birth) }] : []),
                ...(p.phone ? [{ label: "Mobile", value: formatPhone(p.phone) }] : []),
                ...(p.abha_number ? [{ label: "ABHA", value: maskAbha(p.abha_number) }] : []),
                { label: "Registered", value: formatDate(p.created_at) },
              ]}
            />
          </Card>
          {acquires && <PortalCard patient={p} />}
        </aside>
      </div>
    </>
  );
}

function PortalCard({ patient }: { patient: Patient }) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const enable = useMutation({
    mutationFn: () => api.enablePortal(patient.id, email.trim()),
    onSuccess: (result) => client.setQueryData(["patient", patient.id], result.patient),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    enable.mutate();
  }

  return (
    <Card>
      <SectionTitle>Patient portal</SectionTitle>
      {enable.data ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Share these sign-in details with {patient.name}. The password is shown only once; they
            should change it after signing in.
          </p>
          <div className="border-line bg-subtle rounded-lg border p-3">
            <p className="text-muted text-xs">Email</p>
            <p className="text-ink-strong">{enable.data.patient.email}</p>
            <p className="text-muted mt-2 text-xs">Temporary password</p>
            <p className="flex items-center gap-2">
              <code className="text-ink-strong font-mono">{enable.data.temporary_password}</code>
              <CopyButton value={enable.data.temporary_password} label="temporary password" />
            </p>
          </div>
        </div>
      ) : patient.portal_access ? (
        <p className="text-muted text-sm">
          {patient.name} can sign in at {patient.email} to read reports, share them with doctors and
          see who opened them.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-muted text-sm">
            Give {patient.name} online access to their reports and sharing controls.
          </p>
          <Field id="portal-email" label="Patient's email">
            <input
              id="portal-email"
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <ErrorAlert error={enable.error} />
          <Button type="submit" variant="secondary" loading={enable.isPending}>
            Give portal access
          </Button>
        </form>
      )}
    </Card>
  );
}
