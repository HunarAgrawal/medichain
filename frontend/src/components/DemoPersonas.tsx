/** One-click entry into the demo workspace as any role. */

import {
  ArrowRightIcon,
  ChartBarIcon,
  FileTextIcon,
  GlobeHemisphereEastIcon,
  HeartbeatIcon,
  ScanIcon,
  StethoscopeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { useSwitchPersona } from "../auth/session";
import type { DemoPersona } from "../lib/api";
import { useMeta } from "../lib/queries";
import { HOME, ROLE_LABEL } from "../lib/roles";
import { ErrorAlert, Spinner } from "./ui";
import { cx } from "./ui/classes";

function personaIcon(persona: DemoPersona): Icon {
  if (persona.title?.includes("Teleradiology")) return GlobeHemisphereEastIcon;
  const icons = {
    technician: ScanIcon,
    radiologist: FileTextIcon,
    doctor: StethoscopeIcon,
    patient: HeartbeatIcon,
    admin: ChartBarIcon,
  } as const;
  return icons[persona.role];
}

export function DemoPersonas({ next, compact }: { next?: string | null; compact?: boolean }) {
  const { data: meta } = useMeta();
  const enter = useSwitchPersona();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const demo = meta?.demo;
  if (!demo) return null;

  return (
    <div>
      <ul
        className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}
      >
        {demo.personas.map((persona) => {
          const PersonaIcon = personaIcon(persona);
          return (
            <li key={persona.email}>
              <button
                type="button"
                disabled={enter.isPending}
                onClick={() => {
                  setPending(persona.email);
                  enter.mutate(
                    { email: persona.email, password: demo.password },
                    {
                      onSuccess: (user) =>
                        void navigate(next ?? HOME[user.role], { replace: true }),
                      onSettled: () => setPending(null),
                    },
                  );
                }}
                className="group border-line bg-surface hover:border-ink-strong/40 ease-soft flex h-full w-full flex-col rounded-xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="bg-subtle border-line grid size-9 place-items-center rounded-lg border">
                    <PersonaIcon aria-hidden weight="bold" className="text-ink size-4" />
                  </span>
                  {pending === persona.email ? (
                    <Spinner className="text-muted" />
                  ) : (
                    <ArrowRightIcon
                      aria-hidden
                      weight="bold"
                      className="text-muted group-hover:text-ink-strong size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  )}
                </span>
                <span className="text-muted mt-4 text-[11px] font-medium tracking-[0.06em] uppercase">
                  {persona.title?.includes("Teleradiology")
                    ? "Teleradiologist"
                    : ROLE_LABEL[persona.role]}
                </span>
                <span className="text-ink-strong mt-0.5 text-[15px] font-medium">
                  {persona.name}
                </span>
                {!compact && (
                  <span className="text-muted mt-1.5 text-sm text-pretty">
                    {persona.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {enter.isError && (
        <div className="mt-4">
          <ErrorAlert error={enter.error} />
        </div>
      )}
    </div>
  );
}
