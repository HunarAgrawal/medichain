import { WarningOctagonIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { CriticalBadge, PatientCell, PriorityBadge, WaitingTime } from "../../components/Clinical";
import {
  EmptyState,
  PageError,
  PageHeader,
  Segmented,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api, type StudySummary } from "../../lib/api";
import { formatDateTime, timeAgo } from "../../lib/format";

export function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"ready" | "pending">("ready");
  // Fixed when the page opens, so renders stay pure.
  const [weekAgo] = useState(() => Date.now() - 7 * 24 * 3600 * 1000);
  const studies = useQuery({
    queryKey: ["studies", "doctor"],
    queryFn: () => api.studies({ limit: 200 }),
    refetchInterval: 20_000,
  });
  const all = studies.data ?? [];
  const ready = all
    .filter((s) => s.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const pending = all.filter((s) => s.status === "draft");
  const critical = ready.filter(
    (s) => s.critical && s.published_at && new Date(s.published_at).getTime() > weekAgo,
  );
  const open = (study: StudySummary) => void navigate(`/studies/${study.id}`);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Reports for patients you referred, and records patients have shared with you. New reports arrive the moment they are signed."
      />

      {critical.length > 0 && (
        <section
          aria-labelledby="critical-heading"
          className="border-bad/30 bg-bad-soft mb-8 rounded-xl border p-5"
        >
          <h2
            id="critical-heading"
            className="text-bad flex items-center gap-2 text-[15px] font-medium"
          >
            <WarningOctagonIcon aria-hidden weight="bold" className="size-4" />
            Critical findings this week
          </h2>
          <ul className="mt-3 space-y-2">
            {critical.map((study) => (
              <li key={study.id}>
                <Link
                  to={`/studies/${study.id}`}
                  className="bg-surface border-bad/20 hover:border-bad/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
                >
                  <PatientCell patient={study.patient} />
                  <span className="text-ink-strong text-sm font-medium">
                    {study.modality}: {study.top_finding}
                  </span>
                  <span className="text-muted text-xs">
                    {study.published_at ? timeAgo(study.published_at) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4">
        <Segmented
          name="tab"
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: "ready", label: `Ready (${ready.length})` },
            { value: "pending", label: `Being reported (${pending.length})` },
          ]}
        />
      </div>

      {studies.isError ? (
        <PageError error={studies.error} onRetry={() => void studies.refetch()} />
      ) : studies.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : tab === "ready" ? (
        ready.length === 0 ? (
          <EmptyState title="No reports yet">
            Reports for patients you refer appear here as soon as the radiologist signs them.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Patient</Th>
                <Th>Study</Th>
                <Th>Impression</Th>
                <Th>Radiologist</Th>
                <Th>Reported</Th>
              </tr>
            </thead>
            <tbody>
              {ready.map((study) => (
                <tr
                  key={study.id}
                  className="group hover:bg-subtle cursor-pointer"
                  onClick={() => open(study)}
                >
                  <Td>
                    <Link
                      to={`/studies/${study.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block"
                    >
                      <PatientCell patient={study.patient} />
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-ink-strong block text-sm">{study.modality}</span>
                    <span className="text-muted block text-xs">{study.accession}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {study.top_finding ?? <span className="text-muted">Shared record</span>}
                      {study.critical && <CriticalBadge />}
                    </span>
                  </Td>
                  <Td className="text-muted text-sm">{study.radiologist?.name}</Td>
                  <Td className="text-muted text-sm whitespace-nowrap">
                    {study.published_at ? formatDateTime(study.published_at) : ""}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : pending.length === 0 ? (
        <EmptyState title="Nothing waiting">Every study you referred has been reported.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Study</Th>
              <Th>Priority</Th>
              <Th>Site</Th>
              <Th className="text-right">Waiting</Th>
            </tr>
          </thead>
          <tbody>
            {pending.map((study) => (
              <tr
                key={study.id}
                className="group hover:bg-subtle cursor-pointer"
                onClick={() => open(study)}
              >
                <Td>
                  <PatientCell patient={study.patient} />
                </Td>
                <Td>
                  <span className="text-ink-strong block text-sm">{study.modality}</span>
                  <span className="text-muted block text-xs">{study.accession}</span>
                </Td>
                <Td>
                  <PriorityBadge priority={study.priority} />
                </Td>
                <Td className="text-muted text-sm">{study.site.name}</Td>
                <Td className="text-right">
                  <WaitingTime study={study} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
