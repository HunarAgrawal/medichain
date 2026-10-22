import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useUser } from "../../auth/session";
import {
  ButtonLink,
  EmptyState,
  PageError,
  PageHeader,
  PersonLine,
  SectionTitle,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from "../../components/ui";
import { api, type StudySummary } from "../../lib/api";
import { formatDate, timeAgo } from "../../lib/format";

export function WorklistPage() {
  const user = useUser();
  const drafts = useQuery({
    queryKey: ["studies", "draft"],
    queryFn: () => api.studies({ status: "draft" }),
  });
  const published = useQuery({
    queryKey: ["studies", "published"],
    queryFn: () => api.studies({ status: "published", limit: 100 }),
  });
  const patients = useQuery({ queryKey: ["my-patients"], queryFn: api.myPatients });

  const mine = published.data?.filter((s) => s.clinician.id === user.id) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={user.title ?? "Clinician"}
        title={`Good to see you, ${user.name.replace(/^Dr\.?\s+/, "Dr. ")}`}
        description="Review AI-assisted studies, sign reports, and open records your patients have shared with you."
        action={
          <ButtonLink
            to="/studies/new"
            icon={<PlusIcon aria-hidden weight="bold" className="size-4" />}
          >
            New study
          </ButtonLink>
        }
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting review"
          value={drafts.data?.length ?? "–"}
          hint="Drafts you need to sign"
        />
        <StatCard
          label="Reports signed"
          value={published.data ? mine.length : "–"}
          hint="Published by you"
        />
        <StatCard
          label="Patients"
          value={patients.data?.length ?? "–"}
          hint="Reported or shared with you"
        />
      </div>

      <section className="mb-10">
        <SectionTitle>Awaiting your review</SectionTitle>
        <StudyTable
          query={drafts}
          empty={
            <EmptyState
              title="Nothing to review"
              action={
                <ButtonLink to="/studies/new" variant="secondary">
                  Start a study
                </ButtonLink>
              }
            >
              New AI analyses wait here until you review and sign them.
            </EmptyState>
          }
          columns="draft"
        />
      </section>

      <section>
        <SectionTitle>Recently signed</SectionTitle>
        <StudyTable
          query={published}
          empty={
            <EmptyState title="No signed reports yet">
              Reports you publish, and reports patients share with you, appear here.
            </EmptyState>
          }
          columns="published"
          viewerId={user.id}
        />
      </section>
    </>
  );
}

function StudyTable({
  query,
  empty,
  columns,
  viewerId,
}: {
  query: { data?: StudySummary[]; isPending: boolean; error: unknown; refetch: () => unknown };
  empty: ReactNode;
  columns: "draft" | "published";
  viewerId?: string;
}) {
  if (query.isPending) return <Skeleton className="h-32 rounded-xl" />;
  if (query.error) return <PageError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data?.length) return <>{empty}</>;
  const rows = columns === "published" ? query.data.slice(0, 10) : query.data;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Patient</Th>
          <Th>Study</Th>
          <Th>{columns === "draft" ? "AI suggestion" : "Finding"}</Th>
          <Th>{columns === "draft" ? "Analysed" : "Signed"}</Th>
          <Th className="text-right">
            <span className="sr-only">Action</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((study) => (
          <tr key={study.id} className="group hover:bg-subtle/60">
            <Td>
              <PersonLine name={study.patient.name} detail={study.patient.reference} size="sm" />
            </Td>
            <Td>
              <span className="text-ink-strong">{study.analysis_name}</span>
              <span className="text-muted block text-xs">{study.modality}</span>
            </Td>
            <Td>
              <span className="text-ink-strong">{study.top_finding ?? "—"}</span>
              {columns === "published" && viewerId && study.clinician.id !== viewerId && (
                <span className="text-muted block text-xs">Shared · {study.clinician.name}</span>
              )}
            </Td>
            <Td className="text-muted whitespace-nowrap">
              {columns === "draft"
                ? timeAgo(study.created_at)
                : formatDate(study.published_at ?? study.created_at)}
            </Td>
            <Td className="text-right">
              <Link
                to={`/studies/${study.id}`}
                className="text-ink-strong text-sm font-medium underline-offset-4 hover:underline"
              >
                {columns === "draft" ? "Review" : "Open"}
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
