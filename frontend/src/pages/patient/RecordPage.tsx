import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { useUser } from "../../auth/session";
import { ActivityList } from "../../components/Activity";
import {
  AiFindings,
  ClinicalReview,
  RecordProof,
  ScanImages,
  StudyHeader,
} from "../../components/Study";
import { Card, PageError, PageLoading, SectionTitle } from "../../components/ui";
import { api } from "../../lib/api";

export function RecordPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const study = useQuery({ queryKey: ["study", id], queryFn: () => api.study(id) });
  const activity = useQuery({
    queryKey: ["study-activity", id],
    queryFn: () => api.studyActivity(id),
  });

  if (study.isPending) return <PageLoading />;
  if (study.error) return <PageError error={study.error} onRetry={() => void study.refetch()} />;

  return (
    <>
      <Link
        to="/records"
        className="text-muted hover:text-ink-strong mb-6 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon aria-hidden weight="bold" className="size-3.5" /> All records
      </Link>
      <StudyHeader study={study.data} viewer="patient" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <ClinicalReview study={study.data} />
          <ScanImages study={study.data} />
          <AiFindings study={study.data} />
        </div>
        <aside className="space-y-6">
          <RecordProof study={study.data} />
          <Card>
            <SectionTitle>Record history</SectionTitle>
            {activity.data ? (
              <ActivityList
                events={activity.data}
                me={user}
                empty="Nobody has opened this record yet."
              />
            ) : (
              <p className="text-muted text-sm">Loading…</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
