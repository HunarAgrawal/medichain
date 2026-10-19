import { useQuery } from "@tanstack/react-query";

import { useUser } from "../../auth/session";
import { ActivityList } from "../../components/Activity";
import { Card, PageError, PageHeader, Skeleton } from "../../components/ui";
import { api } from "../../lib/api";

export function ActivityPage() {
  const user = useUser();
  const activity = useQuery({ queryKey: ["activity"], queryFn: api.activity });

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything that happened to your records: who created and signed them, who opened them, and every sharing change."
      />
      <Card className="max-w-3xl">
        {activity.isPending && <Skeleton className="h-40" />}
        {activity.error && (
          <PageError error={activity.error} onRetry={() => void activity.refetch()} />
        )}
        {activity.data && (
          <ActivityList
            events={activity.data}
            me={user}
            empty="Activity on your records will appear here."
          />
        )}
      </Card>
    </>
  );
}
