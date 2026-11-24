/** Presenter bar for demo workspaces: who you are, a hint for this role, one-click role switching. */

import { ArrowsLeftRightIcon, CaretUpIcon, LightbulbIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useSwitchPersona, useUser } from "../auth/session";
import type { Role } from "../lib/api";
import { useMeta } from "../lib/queries";
import { HOME, ROLE_LABEL } from "../lib/roles";
import { Avatar, Spinner } from "./ui";
import { cx } from "./ui/classes";

// What to try first, by demo persona.
const TIPS = {
  Radiographer:
    "Register a walk-in patient, then start a new study. It reaches the radiologist at once.",
  Radiologist:
    "Open the STAT chest X-ray at the top: review the AI pre-read, then sign the report.",
  Teleradiologist:
    "Partner-clinic studies wait here. Report them remotely with the same worklist and signing.",
  "Lab technologist":
    "Start a new study, choose Laboratory and enter a blood count: abnormal values flag themselves.",
  Pathologist:
    "Open the STAT blood count at the top: a critical haemoglobin is flagged. Verify and sign it.",
  "Referring doctor":
    "Reports you referred arrive here the moment they are signed. Critical ones come first.",
  Patient:
    "Open a report, then share your records with a doctor. You can withdraw access any time.",
  Admin: "Live turnaround, AI agreement and workload across every site. Rebrand it in Settings.",
} satisfies Record<string, string>;
const ROLE_TIPS: Record<Role, string> = {
  technician: TIPS.Radiographer,
  radiologist: TIPS.Radiologist,
  pathologist: TIPS.Pathologist,
  doctor: TIPS["Referring doctor"],
  patient: TIPS.Patient,
  admin: TIPS.Admin,
};

export function DemoBar() {
  const user = useUser();
  const { data: meta } = useMeta();
  const switchPersona = useSwitchPersona();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !menu.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const demo = meta?.demo;
  if (!demo) return null;
  const me = demo.personas.find((p) => p.email === user.email);
  const tip = (me && (TIPS as Record<string, string>)[me.label]) ?? ROLE_TIPS[user.role];

  return (
    <div
      ref={menu}
      className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4"
      role="region"
      aria-label="Demo controls"
    >
      <div className="relative w-full max-w-3xl">
        {open && (
          <ul className="border-line bg-surface absolute right-0 bottom-full mb-2 w-full max-w-sm overflow-hidden rounded-xl border p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] sm:w-80">
            {demo.personas.map((persona) => (
              <li key={persona.email}>
                <button
                  type="button"
                  disabled={persona.email === user.email || switchPersona.isPending}
                  onClick={() =>
                    switchPersona.mutate(
                      { email: persona.email, password: demo.password },
                      {
                        onSuccess: (next) => {
                          setOpen(false);
                          void navigate(HOME[next.role]);
                        },
                      },
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                >
                  <Avatar name={persona.name} size="sm" />
                  <span className="min-w-0">
                    <span className="text-ink-strong block truncate text-sm font-medium">
                      {persona.name}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {persona.label}
                      {persona.title && persona.title !== persona.label
                        ? ` · ${persona.title}`
                        : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="bg-ink-strong flex items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase">
            Demo
          </span>
          <p className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-white/80 md:flex">
            <LightbulbIcon aria-hidden weight="bold" className="size-4 shrink-0 text-white/60" />
            <span className="truncate">{tip}</span>
          </p>
          <span className="min-w-0 flex-1 truncate text-sm md:hidden">
            {user.name} · {me?.label ?? ROLE_LABEL[user.role]}
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen((value) => !value)}
            className={cx(
              "ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
              open ? "bg-white text-black" : "bg-white/10 hover:bg-white/20",
            )}
          >
            {switchPersona.isPending ? (
              <Spinner />
            ) : (
              <ArrowsLeftRightIcon aria-hidden weight="bold" className="size-4" />
            )}
            Switch role
            <CaretUpIcon aria-hidden weight="bold" className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
