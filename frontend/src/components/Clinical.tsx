/** Small clinical building blocks shared by every role's screens. */

import { ClockIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { PatientSummary, Priority, StudySummary } from "../lib/api";
import {
  DEFAULT_TARGET_MINUTES,
  PRIORITY_LABEL,
  ageSex,
  formatMinutes,
  minutesSince,
  tatState,
} from "../lib/clinical";
import { useMeta } from "../lib/queries";
import { Badge } from "./ui";
import { cx } from "./ui/classes";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = priority === "stat" ? "bad" : priority === "urgent" ? "warn" : "neutral";
  return <Badge tone={tone}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function StatusBadge({ study }: { study: Pick<StudySummary, "status"> }) {
  return study.status === "draft" ? (
    <Badge tone="info">Awaiting report</Badge>
  ) : (
    <Badge tone="ok">Reported</Badge>
  );
}

export function CriticalBadge() {
  return (
    <span className="bg-bad-soft text-bad inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] uppercase">
      <WarningOctagonIcon aria-hidden weight="bold" className="size-3" /> Critical
    </span>
  );
}

/** Re-render every 30 seconds so waiting times stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useTarget(priority: Priority): number {
  const { data: meta } = useMeta();
  return meta?.tat_targets_minutes[priority] ?? DEFAULT_TARGET_MINUTES[priority];
}

const TAT_TONES = {
  ok: "text-ink",
  near: "text-warn",
  late: "text-bad font-medium",
} as const;

/** How long a study has waited for its report, coloured against its turnaround target. */
export function WaitingTime({ study }: { study: Pick<StudySummary, "created_at" | "priority"> }) {
  const now = useNow();
  const target = useTarget(study.priority);
  const minutes = minutesSince(study.created_at, now);
  const state = tatState(minutes, target);
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 text-sm tabular-nums", TAT_TONES[state])}
      title={`Target ${formatMinutes(target)}`}
    >
      <ClockIcon aria-hidden weight="bold" className="size-3.5" />
      {formatMinutes(minutes)}
      {state === "late" && <span className="sr-only"> (over target)</span>}
    </span>
  );
}

/** A signed study's turnaround time, coloured against its target. */
export function Turnaround({
  study,
}: {
  study: Pick<StudySummary, "turnaround_minutes" | "priority">;
}) {
  const target = useTarget(study.priority);
  if (study.turnaround_minutes === null) return null;
  const state = tatState(study.turnaround_minutes, target);
  return (
    <span className={cx("text-sm tabular-nums", TAT_TONES[state])}>
      {formatMinutes(study.turnaround_minutes)}
    </span>
  );
}

export function PatientCell({ patient }: { patient: PatientSummary }) {
  return (
    <span className="block min-w-0">
      <span className="text-ink-strong block truncate text-sm font-medium">{patient.name}</span>
      <span className="text-muted block truncate text-xs">
        {patient.uhid}
        {ageSex(patient) && ` · ${ageSex(patient)}`}
      </span>
    </span>
  );
}
