import { useQuery } from "@tanstack/react-query";

import {
  Badge,
  Card,
  DetailList,
  PageError,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatCard,
} from "../../components/ui";
import { api } from "../../lib/api";
import { shortHash } from "../../lib/format";
import { explorerAddressUrl, useMeta } from "../../lib/queries";

const SERVICE_LABEL: Record<string, string> = {
  chain: "Blockchain registry",
  ipfs: "IPFS storage",
};

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.adminOverview,
    refetchInterval: 30_000,
  });
  const { data: meta } = useMeta();

  return (
    <>
      <PageHeader
        title="Overview"
        description="Accounts, studies and the health of the services Medichain depends on. Admins see metadata only, never clinical content."
      />
      {overview.error && (
        <PageError error={overview.error} onRetry={() => void overview.refetch()} />
      )}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Patients" value={overview.data?.users.patient ?? "–"} />
        <StatCard label="Clinicians" value={overview.data?.users.clinician ?? "–"} />
        <StatCard label="Admins" value={overview.data?.users.admin ?? "–"} />
        <StatCard label="Signed reports" value={overview.data?.studies.published ?? "–"} />
        <StatCard label="Drafts" value={overview.data?.studies.draft ?? "–"} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Service health</SectionTitle>
          {!overview.data && <Skeleton className="h-24" />}
          <ul className="divide-line divide-y">
            {overview.data &&
              Object.entries(overview.data.services).map(([name, check]) => (
                <li key={name} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-ink-strong text-sm font-medium">
                      {SERVICE_LABEL[name] ?? name}
                    </p>
                    <p className="text-muted mt-0.5 text-sm break-words">{check.detail}</p>
                  </div>
                  {check.ok ? (
                    <Badge tone="ok">Healthy</Badge>
                  ) : (
                    <Badge tone="bad">Attention</Badge>
                  )}
                </li>
              ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle>Registry contract</SectionTitle>
          {meta && (
            <DetailList
              items={[
                {
                  label: "Address",
                  value: meta.chain.contract_address,
                  display: shortHash(meta.chain.contract_address, 10, 8),
                  mono: true,
                  copy: true,
                  href: explorerAddressUrl(meta.chain.explorer_url, meta.chain.contract_address),
                },
                { label: "Chain ID", value: String(meta.chain.chain_id), mono: true },
                { label: "Analyses", value: meta.analysis_types.map((t) => t.name).join(", ") },
              ]}
            />
          )}
          <p className="text-muted mt-4 text-xs leading-relaxed">
            Creating a clinician registers them on this contract; deactivating them removes their
            access to every record immediately.
          </p>
        </Card>
      </div>
    </>
  );
}
