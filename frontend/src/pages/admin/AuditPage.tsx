import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useUser } from "../../auth/session";
import {
  Badge,
  Button,
  EmptyState,
  PageError,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api } from "../../lib/api";
import { describeEvent } from "../../lib/describeEvent";
import { formatDateTime, shortHash } from "../../lib/format";
import { explorerTxUrl, useMeta } from "../../lib/queries";

const ACTIONS = [
  "login",
  "login_failed",
  "logout",
  "password_changed",
  "study_created",
  "study_published",
  "study_discarded",
  "file_viewed",
  "access_granted",
  "access_revoked",
  "user_created",
  "user_deactivated",
  "user_reactivated",
  "report_verified",
];
const PAGE = 50;

export function AuditPage() {
  const me = useUser();
  const { data: meta } = useMeta();
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const events = useQuery({
    queryKey: ["audit", action, offset],
    queryFn: () => api.auditLog({ action: action || undefined, limit: PAGE, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every sign-in, study, file access and consent change. Entries with a transaction are also recorded on-chain."
        action={
          <div className="w-56">
            <label htmlFor="action-filter" className="sr-only">
              Filter by event
            </label>
            <Select
              id="action-filter"
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All events</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {events.isPending && <Skeleton className="h-64 rounded-xl" />}
      {events.error && <PageError error={events.error} onRetry={() => void events.refetch()} />}
      {events.data?.length === 0 && <EmptyState title="No matching events" />}
      {events.data && events.data.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Type</Th>
                <Th>Transaction</Th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((event) => {
                const url = event.tx_hash
                  ? explorerTxUrl(meta?.chain.explorer_url, event.tx_hash)
                  : undefined;
                return (
                  <tr key={event.id} className="group">
                    <Td className="text-muted whitespace-nowrap">{formatDateTime(event.at)}</Td>
                    <Td className="text-ink">{describeEvent(event, me)}</Td>
                    <Td>
                      <Badge tone={event.action === "login_failed" ? "bad" : "neutral"}>
                        {event.action.replaceAll("_", " ")}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-xs whitespace-nowrap">
                      {event.tx_hash ? (
                        url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                            title={event.tx_hash}
                          >
                            {shortHash(event.tx_hash)}
                          </a>
                        ) : (
                          <span title={event.tx_hash}>{shortHash(event.tx_hash)}</span>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-muted text-sm">
              Events {offset + 1}–{offset + events.data.length}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={events.data.length < PAGE}
                onClick={() => setOffset((o) => o + PAGE)}
              >
                Older
              </Button>
            </span>
          </div>
        </>
      )}
    </>
  );
}
