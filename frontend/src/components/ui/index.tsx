/** Small design-system primitives. Kept in one file so the vocabulary stays in one place. */

import {
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  CopyIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink-strong text-white hover:bg-[#333] disabled:bg-ink-strong/40",
  secondary:
    "border border-line bg-surface text-ink-strong hover:bg-subtle disabled:text-muted disabled:hover:bg-surface",
  ghost: "text-ink hover:bg-black/[0.04] disabled:text-muted disabled:hover:bg-transparent",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "ease-soft inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <CircleNotchIcon
      aria-hidden
      weight="bold"
      className={cx("size-4 motion-safe:animate-spin", className)}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("border-line bg-surface rounded-xl border p-6 sm:p-8", className)}>
      {children}
    </section>
  );
}

export const inputClass =
  "block h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-strong placeholder:text-muted/70 transition-colors focus:border-ink-strong aria-invalid:border-bad disabled:bg-subtle disabled:text-muted";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-ink-strong block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-message`} className="text-bad text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] uppercase",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const ALERT_STYLES = {
  error: { box: "bg-bad-soft text-bad", Icon: WarningCircleIcon },
  warning: { box: "bg-warn-soft text-warn", Icon: WarningCircleIcon },
  info: { box: "bg-info-soft text-info", Icon: InfoIcon },
  success: { box: "bg-ok-soft text-ok", Icon: CheckCircleIcon },
} as const;

interface AlertProps {
  tone: keyof typeof ALERT_STYLES;
  children: ReactNode;
  action?: ReactNode;
}

export function Alert({ tone, children, action }: AlertProps) {
  const { box, Icon } = ALERT_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-lg px-4 py-3 text-sm", box)}
    >
      <Icon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      className="text-muted hover:text-ink-strong grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-black/[0.04]"
    >
      {copied ? (
        <CheckIcon weight="bold" className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

export interface Detail {
  label: string;
  value: string;
  display?: string;
  mono?: boolean;
  copy?: boolean;
}

export function DetailList({ items }: { items: Detail[] }) {
  return (
    <dl className="divide-line divide-y text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex min-h-11 items-center gap-4 py-1.5">
          <dt className="text-muted w-28 shrink-0 sm:w-32">{item.label}</dt>
          <dd
            className={cx(
              "text-ink-strong min-w-0 flex-1 truncate",
              item.mono && "font-mono text-[13px]",
            )}
            title={item.value}
          >
            {item.display ?? item.value}
          </dd>
          {item.copy && <CopyButton value={item.value} label={item.label} />}
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-8 max-w-2xl">
      <h1 className="text-ink-strong font-serif text-4xl leading-[1.1] tracking-[-0.02em] sm:text-[44px]">
        {title}
      </h1>
      <p className="text-muted mt-3 text-pretty">{description}</p>
    </header>
  );
}
