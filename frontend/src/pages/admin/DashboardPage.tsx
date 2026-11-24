import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useUser } from "../../auth/session";
import { PriorityBadge } from "../../components/Clinical";
import { MeterRow, StackedColumns, type Column } from "../../components/charts";
import {
  Card,
  PageError,
  PageHeader,
  PageLoading,
  SectionTitle,
  Segmented,
  StatCard,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { cx } from "../../components/ui/classes";
import { api, type Dashboard } from "../../lib/api";
import { formatMinutes } from "../../lib/clinical";
import { ROLE_LABEL } from "../../lib/roles";

type Period = "7" | "30" | "90";
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const longDay = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function pct(value: number | null): string {
  return value === null ? "–" : `${Math.round(value)}%`;
}

export function DashboardPage() {
  const user = useUser();
  const [period, setPeriod] = useState<Period>("30");
  const board = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => api.dashboard(Number(period)),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  if (board.isPending) return <PageLoading />;
  if (board.isError) return <PageError error={board.error} onRetry={() => void board.refetch()} />;
  const data = board.data;

  return (
    <>
      <PageHeader
        eyebrow={user.organization.name}
        title="Operations"
        description="Volume, turnaround and AI agreement across every site. Aggregates only: no patient data appears here."
      />
      <div className="mb-6">
        <Segmented
          name="period"
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
      </div>

      <div
        className={cx(
          "space-y-6 transition-opacity",
          board.isFetching && board.isPlaceholderData && "opacity-60",
        )}
      >
        <Kpis data={data} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <StackedColumns
              title="Studies acquired per day"
              series={modalities(data)}
              data={columns(data)}
            />
          </Card>
          <Card>
            <SectionTitle>Turnaround against target</SectionTitle>
            <p className="text-muted -mt-2 mb-5 text-xs">
              Share of reports signed within target, from acquisition to signature.
            </p>
            <ul className="space-y-5">
              {data.tat_by_priority.map((row) => (
                <MeterRow
                  key={row.priority}
                  label={<PriorityBadge priority={row.priority} />}
                  detail={
                    row.median_minutes === null
                      ? "No reports in this period"
                      : `Median ${formatMinutes(row.median_minutes)} · target ${formatMinutes(row.target_minutes)} · ${row.reported} reports`
                  }
                  percent={row.within_target_pct}
                  figure={pct(row.within_target_pct)}
                />
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle>Sites</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Site</Th>
                  <Th className="text-right">Studies</Th>
                  <Th className="text-right">Waiting</Th>
                  <Th className="text-right">Median TAT</Th>
                </tr>
              </thead>
              <tbody>
                {data.sites.map((row) => (
                  <tr key={row.site.id} className="group">
                    <Td>
                      <span className="text-ink-strong block text-sm">{row.site.name}</span>
                      <Bar
                        value={row.studies}
                        max={Math.max(...data.sites.map((s) => s.studies), 1)}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{row.studies}</Td>
                    <Td className="text-right tabular-nums">{row.awaiting}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {row.median_tat_minutes === null
                        ? "–"
                        : formatMinutes(row.median_tat_minutes)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
          <section>
            <SectionTitle>Radiologists</SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Radiologist</Th>
                  <Th className="text-right">Reports</Th>
                  <Th className="text-right">Median TAT</Th>
                </tr>
              </thead>
              <tbody>
                {data.radiologists.map((row) => (
                  <tr key={row.radiologist.id} className="group">
                    <Td>
                      <span className="text-ink-strong block text-sm">{row.radiologist.name}</span>
                      <Bar
                        value={row.reports}
                        max={Math.max(...data.radiologists.map((r) => r.reports), 1)}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{row.reports}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {row.median_tat_minutes === null
                        ? "–"
                        : formatMinutes(row.median_tat_minutes)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle>Service health</SectionTitle>
            <ul className="divide-line divide-y">
              {Object.entries(data.services).map(([name, check]) => (
                <li key={name} className="flex items-start gap-3 py-3">
                  {check.ok ? (
                    <CheckCircleIcon
                      aria-hidden
                      weight="fill"
                      className="text-ok mt-0.5 size-4 shrink-0"
                    />
                  ) : (
                    <WarningCircleIcon
                      aria-hidden
                      weight="fill"
                      className="text-bad mt-0.5 size-4 shrink-0"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="text-ink-strong block text-sm font-medium">
                      {name === "chain" ? "Verification ledger" : "Encrypted file storage"}{" "}
                      <span className={cx("font-normal", check.ok ? "text-ok" : "text-bad")}>
                        · {check.ok ? "Healthy" : "Needs attention"}
                      </span>
                    </span>
                    <span className="text-muted block truncate text-xs">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionTitle>People</SectionTitle>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Object.entries(data.staff).map(([role, count]) => (
                <div key={role}>
                  <dt className="text-muted text-xs">
                    {ROLE_LABEL[role as keyof typeof ROLE_LABEL]}s
                  </dt>
                  <dd className="text-ink-strong text-xl font-semibold">{count}</dd>
                </div>
              ))}
              <div>
                <dt className="text-muted text-xs">Registered patients</dt>
                <dd className="text-ink-strong text-xl font-semibold">{data.patients}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpis({ data }: { data: Dashboard }) {
  const k = data.kpis;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Studies today"
        value={k.studies_today}
        hint={`${k.reported_today} reported today`}
      />
      <StatCard
        label="Awaiting report"
        value={k.awaiting_report}
        hint={k.stat_waiting ? `${k.stat_waiting} STAT waiting` : "No STAT waiting"}
      />
      <StatCard
        label="Median turnaround"
        value={k.median_tat_minutes === null ? "–" : formatMinutes(k.median_tat_minutes)}
        hint={`${k.studies_in_period} studies in ${data.period_days} days`}
      />
      <StatCard
        label="Within target"
        value={pct(k.within_target_pct)}
        hint="Reports signed on time"
      />
      <StatCard
        label="AI agreement"
        value={pct(k.ai_agreement_pct)}
        hint="Radiologist confirmed the AI's top finding"
      />
      <StatCard
        label="Critical findings"
        value={k.critical_findings}
        hint={`Flagged in ${data.period_days} days`}
      />
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="mt-1.5 block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-[#cde2fb]">
      <span
        className="block h-full rounded-full bg-[#2a78d6]"
        style={{ width: `${(value / max) * 100}%` }}
      />
    </span>
  );
}

function modalities(data: Dashboard) {
  const keys = Object.keys(data.daily[0]?.by_modality ?? {}).sort((a, b) => (a < b ? -1 : 1));
  return keys.map((key) => ({ key, label: key }));
}

function columns(data: Dashboard): Column[] {
  const every = data.daily.length > 40 ? 14 : data.daily.length > 10 ? 5 : 1;
  return data.daily.map((row, index) => {
    const date = new Date(`${row.day}T00:00:00`);
    const last = index === data.daily.length - 1;
    return {
      key: row.day,
      label: longDay.format(date),
      tick: last || (data.daily.length - 1 - index) % every === 0 ? day.format(date) : "",
      values: row.by_modality,
      note: `${row.reported} reported`,
    };
  });
}
