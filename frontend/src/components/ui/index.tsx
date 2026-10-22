/** Design-system primitives. Kept in one file so the visual vocabulary stays in one place. */

import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  CopyIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Link, type LinkProps } from "react-router";

import { errorText } from "../../lib/errors";
import { initials } from "../../lib/format";
import { buttonClass, cx, inputClass, type ButtonSize, type ButtonVariant } from "./classes";

// Buttons

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
      className={cx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx(buttonClass(variant, size), className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

/** Two-step inline confirmation instead of a modal. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  loading,
  variant = "secondary",
  size = "sm",
}: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant={variant} size={size} loading={loading} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        variant="danger"
        size={size}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
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

// Layout

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("border-line bg-surface rounded-xl border p-6 sm:p-7", className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <div className="text-muted mb-2 text-xs font-medium tracking-[0.06em] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-ink-strong font-serif text-4xl leading-[1.1] tracking-[-0.02em] sm:text-[44px]">
          {title}
        </h1>
        {description && <p className="text-muted mt-3 text-pretty">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-ink-strong text-[15px] font-medium">{children}</h2>
      {action}
    </div>
  );
}

// Forms

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(inputClass, "appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <CaretDownIcon
        aria-hidden
        weight="bold"
        className="text-muted pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
      />
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
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

// Status

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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] whitespace-nowrap uppercase",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StudyStatusBadge({ status }: { status: "draft" | "published" }) {
  return status === "draft" ? (
    <Badge tone="warn">Awaiting review</Badge>
  ) : (
    <Badge tone="ok">Signed</Badge>
  );
}

const ALERT_STYLES = {
  error: { box: "bg-bad-soft text-bad", Icon: WarningCircleIcon },
  warning: { box: "bg-warn-soft text-warn", Icon: WarningCircleIcon },
  info: { box: "bg-info-soft text-info", Icon: InfoIcon },
  success: { box: "bg-ok-soft text-ok", Icon: CheckCircleIcon },
} as const;

export function Alert({
  tone,
  children,
  action,
}: {
  tone: keyof typeof ALERT_STYLES;
  children: ReactNode;
  action?: ReactNode;
}) {
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

export function ErrorAlert({ error }: { error: unknown }) {
  return error ? <Alert tone="error">{errorText(error)}</Alert> : null;
}

// Data display

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
  display?: ReactNode;
  mono?: boolean;
  copy?: boolean;
  href?: string;
}

export function DetailList({ items }: { items: Detail[] }) {
  return (
    <dl className="divide-line divide-y text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex min-h-11 items-center gap-4 py-1.5">
          <dt className="text-muted w-28 shrink-0 sm:w-36">{item.label}</dt>
          <dd
            className={cx(
              "text-ink-strong min-w-0 flex-1 truncate",
              item.mono && "font-mono text-[13px]",
            )}
            title={item.value}
          >
            {item.display ?? item.value}
          </dd>
          {item.href && (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.label} in explorer`}
              className="text-muted hover:text-ink-strong grid size-7 shrink-0 place-items-center rounded-md hover:bg-black/[0.04]"
            >
              <ArrowSquareOutIcon className="size-3.5" />
            </a>
          )}
          {item.copy && <CopyButton value={item.value} label={item.label} />}
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm" };
  return (
    <span
      aria-hidden
      className={cx(
        "bg-subtle text-ink border-line grid shrink-0 place-items-center rounded-lg border font-medium",
        sizes[size],
      )}
    >
      {initials(name)}
    </span>
  );
}

export function PersonLine({
  name,
  detail,
  size = "md",
}: {
  name: string;
  detail?: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size={size} />
      <span className="min-w-0">
        <span className="text-ink-strong block truncate text-sm font-medium">{name}</span>
        {detail && <span className="text-muted block truncate text-xs">{detail}</span>}
      </span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="border-line bg-surface rounded-xl border p-5">
      <div className="text-muted text-xs font-medium tracking-[0.06em] uppercase">{label}</div>
      <div className="text-ink-strong mt-2 font-serif text-4xl leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </div>
      {hint && <div className="text-muted mt-2 text-xs">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-line rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="text-ink-strong font-medium">{title}</p>
      {children && (
        <p className="text-muted mx-auto mt-1 max-w-md text-sm text-pretty">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-black/[0.05]", className)} />;
}

export function PageLoading() {
  return (
    <div className="space-y-4" aria-label="Loading" role="status">
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="mt-8 h-64 rounded-xl" />
    </div>
  );
}

export function PageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      tone="error"
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {errorText(error)}
    </Alert>
  );
}

export function Prediction({
  label,
  score,
  highlight,
}: {
  label: string;
  score: number;
  highlight?: boolean;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3">
      <span className="text-ink truncate text-sm">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <span
          className={cx(
            "ease-soft block h-full origin-left rounded-full transition-transform duration-700",
            highlight ? "bg-ink-strong" : "bg-muted/60",
          )}
          style={{ transform: `scaleX(${score})` }}
        />
      </span>
      <span className="text-muted text-right font-mono text-xs tabular-nums">
        {(score * 100).toFixed(1)}%
      </span>
    </li>
  );
}

// Tables

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="border-line bg-surface overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        "text-muted border-line border-b px-4 py-3 text-xs font-medium tracking-[0.04em] whitespace-nowrap uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td
      className={cx("border-line border-b px-4 py-3 align-middle group-last:border-b-0", className)}
    >
      {children}
    </td>
  );
}
