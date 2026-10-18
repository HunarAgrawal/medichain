import { ArrowSquareOutIcon, WalletIcon } from "@phosphor-icons/react";

import { useSession } from "../session/context";
import { Alert, Button, Card } from "./ui";

const STEPS = [
  {
    title: "Analyze",
    text: "A vision transformer classifies the scan and highlights the regions it relied on.",
  },
  {
    title: "Encrypt and store",
    text: "The scan and its PDF report are encrypted with AES-256 and pinned to IPFS.",
  },
  {
    title: "Anchor",
    text: "Your wallet records both files on-chain and decides who else may open them.",
  },
];

export function Welcome() {
  const session = useSession();
  const noWallet = session.status === "no-wallet";

  return (
    <section className="motion-safe:animate-enter mx-auto max-w-3xl py-6 sm:py-14">
      <p className="text-muted text-xs font-medium tracking-[0.06em] uppercase">
        Research prototype
      </p>
      <h1 className="text-ink-strong mt-3 font-serif text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
        Imaging reports you can verify, owned by your wallet.
      </h1>
      <p className="text-muted mt-5 max-w-xl text-pretty">
        Medichain classifies brain MRIs and chest X-rays, writes a PDF report, stores both encrypted
        on IPFS and anchors them on-chain, so the people you authorize can check that nothing
        changed.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {noWallet ? (
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="bg-ink-strong inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition hover:bg-[#333] active:scale-[0.98]"
          >
            Install MetaMask
            <ArrowSquareOutIcon aria-hidden weight="bold" className="size-4" />
          </a>
        ) : (
          <Button
            loading={session.status === "signing-in"}
            icon={<WalletIcon weight="bold" className="size-4" aria-hidden />}
            onClick={() => void session.signIn()}
          >
            {session.status === "signing-in" ? "Check your wallet" : "Sign in with wallet"}
          </Button>
        )}
        <p className="text-muted text-xs">
          {noWallet
            ? "A browser wallet is required to sign in and own records."
            : "Signing in asks your wallet to sign a message. It sends no transaction and costs no gas."}
        </p>
      </div>

      {session.error && (
        <div className="mt-6">
          <Alert tone="error">{session.error}</Alert>
        </div>
      )}

      <ol className="border-line bg-line mt-14 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="bg-surface p-6">
            <span className="text-muted font-mono text-xs">0{index + 1}</span>
            <h2 className="text-ink-strong mt-3 font-medium">{step.title}</h2>
            <p className="text-muted mt-1 text-sm">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ApiUnavailable() {
  const session = useSession();
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h1 className="text-ink-strong font-serif text-3xl tracking-[-0.02em]">
        The Medichain API is not responding
      </h1>
      <p className="text-muted mt-2 text-sm">{session.error}</p>
      <p className="text-muted mt-1 text-sm">
        Start it with{" "}
        <code className="bg-subtle rounded px-1.5 py-0.5 font-mono text-xs">make backend</code>,
        then try again.
      </p>
      <Button className="mt-6" variant="secondary" onClick={session.retry}>
        Try again
      </Button>
    </Card>
  );
}

export function Loading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="h-10 w-64 animate-pulse rounded bg-black/[0.05]" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-black/[0.04]" />
      <div className="mt-8 h-72 animate-pulse rounded-xl bg-black/[0.04]" />
    </div>
  );
}
