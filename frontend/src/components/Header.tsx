import { SignOutIcon } from "@phosphor-icons/react";

import { chainName } from "../lib/chain";
import { shortHash } from "../lib/format";
import { useSession } from "../session/context";
import { Badge, Button } from "./ui";

export type Tab = "analyze" | "records";

const TABS: { id: Tab; label: string }[] = [
  { id: "analyze", label: "New analysis" },
  { id: "records", label: "Records" },
];

interface HeaderProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Header({ tab, onTabChange }: HeaderProps) {
  const session = useSession();
  const signedIn = session.status === "signed-in";

  return (
    <header className="border-line bg-canvas/85 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <a href="/" className="flex items-center gap-2.5" aria-label="Medichain home">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-ink-strong hidden font-medium tracking-tight sm:inline">
            Medichain
          </span>
        </a>

        {signedIn && (
          <nav aria-label="Primary" className="flex gap-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => onTabChange(item.id)}
                className="text-muted hover:text-ink-strong aria-[current=page]:text-ink-strong rounded-md px-3 py-1.5 text-sm transition-colors aria-[current=page]:bg-black/[0.05]"
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <WalletStatus />
        </div>
      </div>
    </header>
  );
}

function WalletStatus() {
  const session = useSession();

  if (session.status === "signed-in" && session.address) {
    return (
      <>
        {session.chainId !== null && (
          <span className="hidden sm:inline-flex">
            <Badge tone={session.wrongNetwork ? "warn" : "neutral"}>
              {session.wrongNetwork ? "Wrong network" : chainName(session.chainId)}
            </Badge>
          </span>
        )}
        <span
          className="border-line bg-surface text-ink-strong hidden h-8 items-center rounded-md border px-2.5 font-mono text-xs sm:inline-flex"
          title={session.address}
        >
          {shortHash(session.address)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sign out"
          title="Sign out"
          onClick={session.signOut}
          icon={<SignOutIcon weight="bold" className="size-4" aria-hidden />}
        />
      </>
    );
  }

  return null;
}
