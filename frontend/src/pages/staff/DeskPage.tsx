import { FlaskIcon, PlusIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { useUser } from "../../auth/session";
import {
  PatientCell,
  PriorityBadge,
  StatusBadge,
  Turnaround,
  WaitingTime,
} from "../../components/Clinical";
import {
  ButtonLink,
  EmptyState,
  PageError,
  PageHeader,
  Segmented,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";

function startOfToday(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export function DeskPage() {
  const user = useUser();
  const [scope, setScope] = useState<"site" | "all">(user.site ? "site" : "all");
  const since = startOfToday();
  const studies = useQuery({
    queryKey: ["studies", "today", since],
    queryFn: () => api.studies({ since, limit: 200 }),
    refetchInterval: 30_000,
  });
  const rows = (studies.data ?? []).filter(
    (s) => scope === "all" || !user.site || s.site.id === user.site.id,
  );
  const waiting = rows.filter((s) => s.status === "draft");

  return (
    <>
      <PageHeader
        eyebrow={user.site?.name ?? user.organization.name}
        title="Today"
        description="Every scan and lab test from today, and where each one is in reporting."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              to="/patients?register=1"
              variant="secondary"
              icon={<UserPlusIcon aria-hidden weight="bold" className="size-4" />}
            >
              Register patient
            </ButtonLink>
            <ButtonLink
              to="/studies/new?type=cbc"
              variant="secondary"
              icon={<FlaskIcon aria-hidden weight="bold" className="size-4" />}
            >
              Lab results
            </ButtonLink>
            <ButtonLink
              to="/studies/new"
              icon={<PlusIcon aria-hidden weight="bold" className="size-4" />}
            >
              New study
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Acquired today" value={studies.isPending ? "–" : rows.length} />
        <StatCard
          label="Awaiting report"
          value={studies.isPending ? "–" : waiting.length}
          hint={
            waiting.some((s) => s.priority === "stat")
              ? `${waiting.filter((s) => s.priority === "stat").length} STAT`
              : "None urgent"
          }
        />
        <StatCard
          label="Reported today"
          value={studies.isPending ? "–" : rows.length - waiting.length}
          hint="Delivered to doctors and patients"
        />
      </div>

      <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink-strong text-[15px] font-medium">Today's studies</h2>
        {user.site && (
          <Segmented
            name="scope"
            label="Show studies from"
            value={scope}
            onChange={setScope}
            options={[
              { value: "site", label: user.site.name },
              { value: "all", label: "All sites" },
            ]}
          />
        )}
      </div>

      {studies.isError ? (
        <PageError error={studies.error} onRetry={() => void studies.refetch()} />
      ) : studies.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing acquired yet today"
          action={<ButtonLink to="/studies/new">Start the first study</ButtonLink>}
        >
          New studies appear here and on the reporting worklist as soon as they are sent.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Patient</Th>
              <Th>Study</Th>
              <Th>Priority</Th>
              <Th>Referred by</Th>
              <Th>Status</Th>
              <Th className="text-right">Waiting / TAT</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((study) => (
              <tr key={study.id} className="group hover:bg-subtle">
                <Td className="text-muted tabular-nums">
                  {time.format(new Date(study.created_at))}
                </Td>
                <Td>
                  <Link to={`/patients/${study.patient.id}`} className="block">
                    <PatientCell patient={study.patient} />
                  </Link>
                </Td>
                <Td>
                  <span className="text-ink-strong block text-sm">{study.modality}</span>
                  <span className="text-muted block text-xs">
                    {study.accession} · {study.site.code}
                  </span>
                </Td>
                <Td>
                  <PriorityBadge priority={study.priority} />
                </Td>
                <Td className="text-muted max-w-48 truncate text-sm">
                  {study.referred_by ?? "Self"}
                </Td>
                <Td>
                  <StatusBadge study={study} />
                </Td>
                <Td className="text-right">
                  {study.status === "draft" ? (
                    <WaitingTime study={study} />
                  ) : (
                    <Turnaround study={study} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
