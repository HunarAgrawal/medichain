import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { useUser } from "../../auth/session";
import {
  CriticalBadge,
  PatientCell,
  PriorityBadge,
  Turnaround,
  WaitingTime,
} from "../../components/Clinical";
import {
  ButtonLink,
  EmptyState,
  PageError,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api, type Priority } from "../../lib/api";
import { DEFAULT_TARGET_MINUTES, minutesSince } from "../../lib/clinical";
import { formatDateTime } from "../../lib/format";
import { useMeta } from "../../lib/queries";
import { REPORTING_DISCIPLINE, ROLE_LABEL } from "../../lib/roles";

type Filter = "all" | Priority;

export function WorklistPage() {
  const user = useUser();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const [priority, setPriority] = useState<Filter>("all");
  const [siteId, setSiteId] = useState("");
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const waiting = useQuery({
    queryKey: ["studies", "worklist"],
    queryFn: () => api.studies({ status: "draft", order: "worklist", limit: 200 }),
    refetchInterval: 20_000,
  });
  const reported = useQuery({
    queryKey: ["studies", "reported-by-me"],
    queryFn: () => api.studies({ status: "published", limit: 30 }),
  });

  const targets = meta?.tat_targets_minutes ?? DEFAULT_TARGET_MINUTES;
  const all = waiting.data ?? [];
  const rows = all.filter(
    (s) => (priority === "all" || s.priority === priority) && (!siteId || s.site.id === siteId),
  );
  const overTarget = all.filter((s) => minutesSince(s.created_at) > targets[s.priority]).length;
  const mine = (reported.data ?? []).filter((s) => s.reporter?.id === user.id);
  const today = new Date().toDateString();
  const mineToday = mine.filter(
    (s) => s.published_at && new Date(s.published_at).toDateString() === today,
  );
  const count = (p: Priority) => all.filter((s) => s.priority === p).length;
  const lab = REPORTING_DISCIPLINE[user.role] === "laboratory";

  return (
    <>
      <PageHeader
        eyebrow={user.title ?? ROLE_LABEL[user.role]}
        title="Worklist"
        description={`${lab ? "Lab results awaiting verification" : "Studies awaiting a report"} across ${user.organization.short_name}. STAT first, then the longest waiting.`}
        action={
          <ButtonLink to="/studies/new" variant="secondary">
            New study
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting report" value={waiting.isPending ? "–" : all.length} />
        <StatCard
          label="STAT waiting"
          value={waiting.isPending ? "–" : count("stat")}
          hint="Target: report within 60 min"
        />
        <StatCard
          label="Over target"
          value={waiting.isPending ? "–" : overTarget}
          hint={overTarget ? "Report these first" : "All within target"}
        />
        <StatCard label="Signed by you today" value={reported.isPending ? "–" : mineToday.length} />
      </div>

      <div className="mt-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          name="priority"
          label="Filter by priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: "all", label: `All (${all.length})` },
            { value: "stat", label: `STAT (${count("stat")})`, tone: "bad" },
            { value: "urgent", label: `Urgent (${count("urgent")})`, tone: "warn" },
            { value: "routine", label: `Routine (${count("routine")})` },
          ]}
        />
        <div className="w-full sm:w-64">
          <label htmlFor="site-filter" className="sr-only">
            Site
          </label>
          <Select
            id="site-filter"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
          >
            <option value="">All sites</option>
            {sites.data?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {waiting.isError ? (
        <PageError error={waiting.error} onRetry={() => void waiting.refetch()} />
      ) : waiting.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "The worklist is clear" : "Nothing matches this filter"}
        >
          New studies appear here the moment a technician sends them.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Priority</Th>
              <Th>Waiting</Th>
              <Th>Patient</Th>
              <Th>Study</Th>
              <Th>Site</Th>
              <Th>Referred by</Th>
              <Th>{lab ? "Flags suggest" : "AI suggests"}</Th>
              <Th>
                <span className="sr-only">Action</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((study) => (
              <tr
                key={study.id}
                className="group hover:bg-subtle cursor-pointer"
                onClick={() => void navigate(`/studies/${study.id}`)}
              >
                <Td>
                  <PriorityBadge priority={study.priority} />
                </Td>
                <Td>
                  <WaitingTime study={study} />
                </Td>
                <Td>
                  <PatientCell patient={study.patient} />
                </Td>
                <Td>
                  <span className="text-ink-strong block text-sm">{study.modality}</span>
                  <span className="text-muted block text-xs">{study.accession}</span>
                </Td>
                <Td className="text-muted text-sm whitespace-nowrap">{study.site.code}</Td>
                <Td className="text-muted max-w-44 truncate text-sm">
                  {study.referred_by ?? "Self"}
                </Td>
                <Td className="text-sm">{study.top_finding}</Td>
                <Td className="text-right">
                  <Link
                    to={`/studies/${study.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="text-ink-strong rounded-md px-2 py-1 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Report
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="text-ink-strong mt-12 mb-4 text-[15px] font-medium">Recently signed by you</h2>
      {mine.length === 0 ? (
        <p className="text-muted text-sm">Reports you sign appear here.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Study</Th>
              <Th>Impression</Th>
              <Th>Signed</Th>
              <Th className="text-right">Turnaround</Th>
            </tr>
          </thead>
          <tbody>
            {mine.slice(0, 8).map((study) => (
              <tr
                key={study.id}
                className="group hover:bg-subtle cursor-pointer"
                onClick={() => void navigate(`/studies/${study.id}`)}
              >
                <Td>
                  <PatientCell patient={study.patient} />
                </Td>
                <Td>
                  <span className="text-ink-strong block text-sm">{study.modality}</span>
                  <span className="text-muted block text-xs">{study.accession}</span>
                </Td>
                <Td>
                  <span className="flex items-center gap-2 text-sm">
                    {study.top_finding}
                    {study.critical && <CriticalBadge />}
                  </span>
                </Td>
                <Td className="text-muted text-sm whitespace-nowrap">
                  {study.published_at ? formatDateTime(study.published_at) : ""}
                </Td>
                <Td className="text-right">
                  <Turnaround study={study} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
