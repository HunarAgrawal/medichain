import type { AuditEvent, User } from "../lib/api";
import { describeEvent } from "../lib/describeEvent";
import { formatDateTime, timeAgo } from "../lib/format";
import { explorerTxUrl, useMeta } from "../lib/queries";
import { Badge, EmptyState } from "./ui";

export function ActivityList({
  events,
  me,
  empty,
}: {
  events: AuditEvent[];
  me: User;
  empty: string;
}) {
  const { data: meta } = useMeta();
  if (events.length === 0) return <EmptyState title="No activity yet">{empty}</EmptyState>;
  return (
    <ol className="divide-line divide-y">
      {events.map((event) => {
        const explorer = event.tx_hash
          ? explorerTxUrl(meta?.chain.explorer_url, event.tx_hash)
          : undefined;
        return (
          <li key={event.id} className="flex items-start gap-3 py-3">
            <span aria-hidden className="bg-ink-strong/70 mt-2 size-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm">{describeEvent(event, me)}</p>
              <p className="text-muted mt-0.5 text-xs" title={formatDateTime(event.at)}>
                {timeAgo(event.at)}
              </p>
            </div>
            {event.tx_hash && (
              <span title={event.tx_hash} className="shrink-0">
                {explorer ? (
                  <a href={explorer} target="_blank" rel="noreferrer">
                    <Badge tone="ok">On-chain</Badge>
                  </a>
                ) : (
                  <Badge tone="ok">On-chain</Badge>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
