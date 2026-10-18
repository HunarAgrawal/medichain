import { CheckIcon, XIcon } from "@phosphor-icons/react";

import { Spinner } from "../../components/ui";

export type PipelinePhase =
  "editing" | "analyzing" | "confirming" | "anchoring" | "anchor-failed" | "done";

type StepState = "pending" | "active" | "done" | "failed";

const STEPS = [
  {
    title: "Analyze and encrypt",
    detail: "Model inference, PDF report, AES-256 encryption, IPFS pinning.",
  },
  { title: "Approve in wallet", detail: "Sign the createRecord transaction." },
  { title: "Anchor on-chain", detail: "Wait for the block confirmation." },
];

function stepStates(phase: PipelinePhase): StepState[] {
  switch (phase) {
    case "editing":
      return ["pending", "pending", "pending"];
    case "analyzing":
      return ["active", "pending", "pending"];
    case "confirming":
      return ["done", "active", "pending"];
    case "anchoring":
      return ["done", "done", "active"];
    case "anchor-failed":
      return ["done", "failed", "pending"];
    case "done":
      return ["done", "done", "done"];
  }
}

function Marker({ state, index }: { state: StepState; index: number }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium";
  if (state === "done") {
    return (
      <span className={`${base} bg-ink-strong text-white`}>
        <CheckIcon weight="bold" className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={`${base} bg-bad-soft text-bad`}>
        <XIcon weight="bold" className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className={`${base} border-ink-strong text-ink-strong border`}>
        <Spinner className="size-3.5" />
      </span>
    );
  }
  return <span className={`${base} border-line text-muted border font-mono`}>{index + 1}</span>;
}

const STATE_LABEL: Record<StepState, string> = {
  pending: "Not started",
  active: "In progress",
  done: "Complete",
  failed: "Failed",
};

export function PipelineSteps({ phase }: { phase: PipelinePhase }) {
  const states = stepStates(phase);
  return (
    <section aria-label="Progress" className="border-line bg-surface rounded-xl border p-6">
      <h2 className="text-ink-strong text-sm font-medium">What happens</h2>
      <ol className="mt-5 space-y-5" aria-live="polite">
        {STEPS.map((step, index) => {
          const state = states[index] ?? "pending";
          return (
            <li key={step.title} className="flex gap-3">
              <Marker state={state} index={index} />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${state === "pending" ? "text-muted" : "text-ink-strong"}`}
                >
                  {step.title}
                  <span className="sr-only">: {STATE_LABEL[state]}</span>
                </p>
                <p className="text-muted text-xs leading-relaxed">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
