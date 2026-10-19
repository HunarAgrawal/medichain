import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorAlert,
  PageError,
  PageHeader,
  PersonLine,
  SectionTitle,
  Skeleton,
} from "../../components/ui";
import { inputClass } from "../../components/ui/classes";
import { api } from "../../lib/api";

export function SharingPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const team = useQuery({ queryKey: ["care-team"], queryFn: api.careTeam });
  const directory = useQuery({
    queryKey: ["clinicians", term],
    queryFn: () => api.searchClinicians(term),
    placeholderData: keepPreviousData,
  });

  const onChange = {
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["care-team"] });
      void client.invalidateQueries({ queryKey: ["activity"] });
    },
  };
  const share = useMutation({ mutationFn: api.share, ...onChange });
  const unshare = useMutation({ mutationFn: api.unshare, ...onChange });
  const sharedIds = new Set(team.data?.map((m) => m.clinician.id));

  return (
    <>
      <PageHeader
        title="Sharing"
        description="Choose which clinicians can open your records. Each change is a consent you sign on-chain, and you can withdraw it at any time."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Your care team</SectionTitle>
          {team.isPending && <Skeleton className="h-16" />}
          {team.error && <PageError error={team.error} onRetry={() => void team.refetch()} />}
          {team.data?.length === 0 && (
            <EmptyState title="Not shared with anyone">
              Only the clinician who reported each study can open it.
            </EmptyState>
          )}
          {team.data && team.data.length > 0 && (
            <ul className="divide-line divide-y">
              {team.data.map(({ clinician, active }) => (
                <li key={clinician.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <PersonLine name={clinician.name} detail={clinician.title ?? "Clinician"} />
                  </div>
                  {!active && <Badge tone="warn">Inactive</Badge>}
                  <ConfirmButton
                    confirmLabel="Remove access"
                    loading={unshare.isPending && unshare.variables === clinician.id}
                    onConfirm={() => unshare.mutate(clinician.id)}
                  >
                    Remove
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-3">
            <ErrorAlert error={unshare.error} />
            {unshare.isSuccess && (
              <Alert tone="success">Access removed. The change is recorded on-chain.</Alert>
            )}
          </div>
          <p className="text-muted border-line mt-6 border-t pt-4 text-xs leading-relaxed">
            Sharing gives a clinician access to all your signed records. The clinician who reported
            a study can always open that study while their account is active.
          </p>
        </Card>

        <Card>
          <SectionTitle>Add a clinician</SectionTitle>
          <label htmlFor="clinician-search" className="sr-only">
            Search clinicians
          </label>
          <div className="relative">
            <MagnifyingGlassIcon
              aria-hidden
              weight="bold"
              className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id="clinician-search"
              className={`${inputClass} pl-9`}
              placeholder="Search by name or specialty"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ul className="divide-line mt-3 divide-y">
            {directory.data?.map((clinician) => {
              const shared = sharedIds.has(clinician.id);
              return (
                <li key={clinician.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <PersonLine name={clinician.name} detail={clinician.title ?? "Clinician"} />
                  </div>
                  {shared ? (
                    <Badge tone="ok">Has access</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={share.isPending && share.variables === clinician.id}
                      disabled={share.isPending}
                      onClick={() => share.mutate(clinician.id)}
                    >
                      Share records
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {directory.data?.length === 0 && (
            <p className="text-muted py-3 text-sm">No clinicians match “{term}”.</p>
          )}
          <div className="mt-3">
            <ErrorAlert error={share.error} />
          </div>
        </Card>
      </div>
    </>
  );
}
