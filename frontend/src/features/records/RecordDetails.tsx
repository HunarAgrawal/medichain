import { ArrowSquareOutIcon, FileTextIcon, ImageSquareIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { Alert, Badge, Button, Card, DetailList } from "../../components/ui";
import { api, ApiError, type FileKind } from "../../lib/api";
import type { OnChainRecord } from "../../lib/chain";
import { formatDate, openBlobInTab, shortHash } from "../../lib/format";
import { useBlobUrl } from "../../lib/useBlobUrl";
import { useSignedInSession } from "../../session/context";
import { AccessManager } from "./AccessManager";

interface RecordDetailsProps {
  patientId: string;
  record: OnChainRecord;
}

export function RecordDetails({ patientId, record }: RecordDetailsProps) {
  const session = useSignedInSession();
  const isOwner = record.owner === session.address;
  const [scanUrl, setScan] = useBlobUrl();
  const [busy, setBusy] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withFile(kind: FileKind, consume: (load: () => Promise<Blob>) => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await consume(() => api.recordFile(session.token, patientId, kind));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return session.expireSession();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  }

  const openReport = () => void withFile("report", openBlobInTab);
  const toggleScan = () =>
    scanUrl ? setScan(null) : void withFile("scan", async (load) => setScan(await load()));

  return (
    <Card className="motion-safe:animate-enter space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">Patient ID</p>
          <h2 className="text-ink-strong mt-1 truncate font-serif text-3xl tracking-[-0.02em]">
            {patientId}
          </h2>
          <p className="text-muted mt-1 text-sm">Recorded {formatDate(record.createdAt)}</p>
        </div>
        {isOwner ? <Badge>Owner</Badge> : <Badge tone="info">Shared with you</Badge>}
      </header>

      <ul className="border-line divide-line divide-y rounded-lg border">
        <FileRow
          icon={<FileTextIcon aria-hidden weight="bold" className="size-4" />}
          title="Analysis report"
          detail="PDF, decrypted on request"
        >
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "report"}
            icon={<ArrowSquareOutIcon aria-hidden weight="bold" className="size-3.5" />}
            onClick={openReport}
          >
            Open
          </Button>
        </FileRow>
        <FileRow
          icon={<ImageSquareIcon aria-hidden weight="bold" className="size-4" />}
          title="Original scan"
          detail="Image, decrypted on request"
        >
          <Button variant="secondary" size="sm" loading={busy === "scan"} onClick={toggleScan}>
            {scanUrl ? "Hide" : "Show"}
          </Button>
        </FileRow>
      </ul>

      {scanUrl && (
        <img
          src={scanUrl}
          alt={`Original scan for ${patientId}`}
          className="max-h-[28rem] w-full rounded-lg bg-black object-contain"
        />
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <DetailList
        items={[
          {
            label: "Owner",
            value: record.owner,
            display: isOwner ? `You (${shortHash(record.owner)})` : record.owner,
            mono: true,
            copy: true,
          },
          {
            label: "Scan CID",
            value: record.scanCid,
            display: shortHash(record.scanCid, 10, 8),
            mono: true,
            copy: true,
          },
          {
            label: "Report CID",
            value: record.reportCid,
            display: shortHash(record.reportCid, 10, 8),
            mono: true,
            copy: true,
          },
        ]}
      />

      {isOwner && <AccessManager patientId={patientId} />}
    </Card>
  );
}

function FileRow({
  icon,
  title,
  detail,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="bg-subtle text-ink grid size-8 shrink-0 place-items-center rounded-md">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink-strong text-sm font-medium">{title}</p>
        <p className="text-muted text-xs">{detail}</p>
      </div>
      {children}
    </li>
  );
}
