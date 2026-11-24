/** Laboratory results: entry with live flags, and the verified results table. */

import { WarningOctagonIcon } from "@phosphor-icons/react";

import type { Analyte, LabFlag, LabResult, Sex, StudyDetail } from "../lib/api";
import { FLAG_LABEL, flagFor, formatReference, isCriticalFlag } from "../lib/labs";
import { Card, SectionTitle, Segmented } from "./ui";
import { cx, inputClass } from "./ui/classes";

const SCREEN_OPTIONS = [
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive", tone: "bad" as const },
];

export function FlagBadge({ flag }: { flag: LabFlag | null }) {
  if (!flag) return null;
  const critical = isCriticalFlag(flag);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        critical || flag === "POS" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn",
      )}
    >
      {critical && <WarningOctagonIcon aria-hidden weight="bold" className="size-3" />}
      {FLAG_LABEL[flag]}
    </span>
  );
}

/** One row per analyte: the value, its unit and interval, and the flag it will carry. */
export function LabEntry({
  analytes,
  sex,
  values,
  onChange,
  disabled,
}: {
  analytes: Analyte[];
  sex: Sex | null;
  values: Record<string, string>;
  onChange: (code: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-line overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted border-line border-b text-xs tracking-[0.04em] uppercase">
            <th scope="col" className="px-3 py-2.5 font-medium">
              Test
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Result
            </th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">
              Reference
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              <span className="sr-only">Flag</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {analytes.map((analyte) => {
            const id = `lab-${analyte.code}`;
            const flag = flagFor(analyte, values[analyte.code], sex);
            return (
              <tr key={analyte.code} className="border-line border-b last:border-b-0">
                <td className="px-3 py-2">
                  {analyte.kind === "screen" ? (
                    <span className="text-ink-strong block">{analyte.name}</span>
                  ) : (
                    <label htmlFor={id} className="text-ink-strong block">
                      {analyte.name}
                    </label>
                  )}
                  {/* On phones the interval and unit sit under the name, leaving room for the flag. */}
                  <span className="text-muted text-xs sm:hidden">
                    {formatReference(analyte, sex)} {analyte.unit}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {analyte.kind === "screen" ? (
                    <Segmented
                      name={id}
                      label={analyte.name}
                      value={values[analyte.code] ?? ""}
                      options={SCREEN_OPTIONS}
                      disabled={disabled}
                      onChange={(value) => onChange(analyte.code, value)}
                    />
                  ) : (
                    <span className="flex items-center gap-2">
                      {/* A fixed box: the shared input class is full-width. */}
                      <span className="w-20 shrink-0 sm:w-24">
                        <input
                          id={id}
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={disabled}
                          aria-invalid={values[analyte.code] ? flag === null : undefined}
                          className={cx(
                            inputClass,
                            "h-9 px-2.5 font-mono tabular-nums",
                            flag && "font-semibold",
                          )}
                          value={values[analyte.code] ?? ""}
                          onChange={(event) => onChange(analyte.code, event.target.value)}
                        />
                      </span>
                      <span className="text-muted hidden text-xs whitespace-nowrap sm:inline">
                        {analyte.unit}
                      </span>
                    </span>
                  )}
                </td>
                <td className="text-muted hidden px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums sm:table-cell">
                  {formatReference(analyte, sex)}
                </td>
                <td className="px-3 py-2 text-right">
                  <FlagBadge flag={flag} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The results as verified and signed: flagged values stand out, critical ones in red. */
export function LabResults({ study }: { study: StudyDetail }) {
  if (study.results.length === 0) return null;
  const flagged = study.results.filter((r) => r.flag);
  const critical = flagged.filter((r) => isCriticalFlag(r.flag));
  return (
    <Card>
      <SectionTitle
        action={
          <span className="text-muted text-xs">
            {flagged.length === 0
              ? "All within reference intervals"
              : `${flagged.length} of ${study.results.length} flagged`}
          </span>
        }
      >
        Results
      </SectionTitle>
      {critical.length > 0 && (
        <p className="bg-bad-soft text-bad mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
          <WarningOctagonIcon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0" />
          {critical.map((r) => r.name).join(", ")} past the critical limit.
          {study.status === "draft" && " Inform the treating doctor before signing."}
        </p>
      )}
      <ResultsTable results={study.results} />
      <p className="text-muted mt-4 text-xs">
        Flags compare each value with the laboratory's reference interval for the patient's sex.
        They are decision support; the pathologist's report is the interpretation.
      </p>
    </Card>
  );
}

function ResultsTable({ results }: { results: LabResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted border-line border-b text-xs tracking-[0.04em] uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">
              Test
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Result
            </th>
            <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">
              Unit
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Reference
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Flag</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.code} className="border-line border-b last:border-b-0">
              <td className="text-ink-strong py-2 pr-3">{r.name}</td>
              <td
                className={cx(
                  "py-2 pr-3 text-right font-mono tabular-nums",
                  r.flag && "font-semibold",
                  isCriticalFlag(r.flag) || r.flag === "POS" ? "text-bad" : "text-ink-strong",
                )}
              >
                {r.text}
                <span className="text-muted ml-1 font-sans text-xs font-normal sm:hidden">
                  {r.unit}
                </span>
              </td>
              <td className="text-muted hidden py-2 pr-3 text-xs sm:table-cell">{r.unit}</td>
              <td className="text-muted py-2 pr-3 font-mono text-xs whitespace-nowrap tabular-nums">
                {r.reference}
              </td>
              <td className="py-2 text-right">
                <FlagBadge flag={r.flag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
