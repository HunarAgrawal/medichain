/** Class-name helpers shared by components (kept out of component files for fast refresh). */

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink-strong text-white hover:bg-[#333] disabled:bg-ink-strong/40",
  secondary:
    "border border-line bg-surface text-ink-strong hover:bg-subtle disabled:text-muted disabled:hover:bg-surface",
  ghost: "text-ink hover:bg-black/[0.04] disabled:text-muted disabled:hover:bg-transparent",
  danger: "border border-bad/25 bg-surface text-bad hover:bg-bad-soft disabled:opacity-50",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(
    "ease-soft inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    BUTTON_VARIANTS[variant],
  );
}

export const inputClass =
  "block h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-strong placeholder:text-muted/70 transition-colors focus:border-ink-strong aria-invalid:border-bad disabled:bg-subtle disabled:text-muted";

export const textareaClass = cx(inputClass, "h-auto min-h-32 py-2.5 leading-relaxed");
