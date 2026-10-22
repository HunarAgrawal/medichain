import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { useUser } from "../../auth/session";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageError,
  PageHeader,
  SectionTitle,
  Skeleton,
} from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";

export function RecordsPage() {
  const user = useUser();
  const records = useQuery({ queryKey: ["studies", "mine"], queryFn: () => api.studies() });
  const team = useQuery({ queryKey: ["care-team"], queryFn: api.careTeam });

  return (
    <>
      <PageHeader
        eyebrow={`${user.reference}`}
        title="Your records"
        description="Reports your clinicians have reviewed and signed. They are stored encrypted, and you decide which other clinicians can open them."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Records" className="space-y-3">
          {records.isPending && [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          {records.error && (
            <PageError error={records.error} onRetry={() => void records.refetch()} />
          )}
          {records.data?.length === 0 && (
            <EmptyState title="No records yet">
              Records appear here as soon as a clinician signs and publishes a study for you.
            </EmptyState>
          )}
          {records.data?.map((study) => (
            <Link
              key={study.id}
              to={`/records/${study.id}`}
              className="group border-line bg-surface flex items-center gap-5 rounded-xl border p-5 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted text-sm">{study.analysis_name}</span>
                  <Badge>{study.modality}</Badge>
                </div>
                <p className="text-ink-strong mt-1 font-serif text-2xl tracking-[-0.02em]">
                  {study.top_finding}
                </p>
                <p className="text-muted mt-1 text-sm">
                  Signed by {study.clinician.name}
                  {study.published_at ? ` · ${formatDate(study.published_at)}` : ""}
                </p>
              </div>
              <ArrowRightIcon
                aria-hidden
                weight="bold"
                className="text-muted group-hover:text-ink-strong size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </section>

        <aside className="space-y-4">
          <Card className="p-5 sm:p-5">
            <SectionTitle>Care team</SectionTitle>
            <p className="text-muted text-sm">
              {team.data === undefined
                ? "Loading…"
                : team.data.length === 0
                  ? "Only the clinicians who reported a study can open it."
                  : `${team.data.length} clinician${team.data.length === 1 ? "" : "s"} can open all your records.`}
            </p>
            <ButtonLink to="/sharing" variant="secondary" size="sm" className="mt-4">
              Manage sharing
            </ButtonLink>
          </Card>
          <Card className="p-5 sm:p-5">
            <SectionTitle>Sending a report?</SectionTitle>
            <p className="text-muted text-sm">
              Whoever receives your PDF can confirm it is genuine on the public verification page.
            </p>
            <ButtonLink to="/verify" variant="ghost" size="sm" className="mt-3 -ml-3">
              Verify a report
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </>
  );
}
