/** Small, dependency-free charts for the operations dashboard.
 *
 * Specs follow the data-viz method: categorical hues in fixed order (validated for colour-vision
 * deficiency), columns at most 24px wide with a 4px rounded data end and a 2px surface gap
 * between stacked segments, hairline gridlines, a legend for two or more series, a per-column
 * tooltip on hover and keyboard focus, and a table view so no value depends on hovering. */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { cx } from "./ui/classes";

// Validated categorical slots (light surface): 1 blue, 2 orange.
const SERIES_COLORS = ["#2a78d6", "#eb6834"] as const;
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";
const AXIS_TEXT = "#898781";
const SURFACE = "#ffffff";
const METER_TRACK = "#cde2fb";

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A clean axis maximum and ticks: steps of 1, 2 or 5 times a power of ten. */
function niceScale(max: number, target = 4): number[] {
  const raw = Math.max(max, 1) / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? power * 10;
  const top = Math.ceil(Math.max(max, 1) / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** A column whose top corners are rounded (the data end); square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

export interface Series {
  key: string;
  label: string;
}

export interface Column {
  key: string;
  label: string;
  /** Short axis label; empty to skip this tick. */
  tick: string;
  values: Record<string, number>;
  note?: string;
}

export function StackedColumns({
  data,
  series,
  title,
  height = 220,
}: {
  data: Column[];
  series: Series[];
  title: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 10, right: 4, bottom: 26, left: 30 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const ticks = niceScale(Math.max(0, ...totals));
  const top = ticks.at(-1) ?? 1;
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.min(24, Math.max(3, slot * 0.62));
  const y = (value: number) => pad.top + innerH - (value / top) * innerH;

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-ink-strong text-[15px] font-medium">{title}</span>
        <span className="text-muted flex items-center gap-4 text-xs">
          {series.map((s, index) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: SERIES_COLORS[index] }}
              />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title} className="block">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? BASELINE : GRID}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={pad.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={11}
                  fill={AXIS_TEXT}
                  className="tabular-nums"
                >
                  {tick}
                </text>
              </g>
            ))}
            {data.map((column, i) => {
              const x = pad.left + i * slot + (slot - barW) / 2;
              let base = y(0);
              const segments = series
                .map((s, index) => ({
                  value: column.values[s.key] ?? 0,
                  color: SERIES_COLORS[index],
                }))
                .filter((segment) => segment.value > 0);
              return (
                <g
                  key={column.key}
                  opacity={active === null || active === i ? 1 : 0.55}
                  className="transition-opacity duration-150"
                >
                  {segments.map((segment, index) => {
                    const h = (segment.value / top) * innerH - (index > 0 ? 2 : 0);
                    const yTop = base - (index > 0 ? 2 : 0) - h;
                    const isTop = index === segments.length - 1;
                    const element = isTop ? (
                      <path
                        key={index}
                        d={columnPath(x, yTop, barW, Math.max(h, 1), 4)}
                        fill={segment.color}
                      />
                    ) : (
                      <rect
                        key={index}
                        x={x}
                        y={yTop}
                        width={barW}
                        height={Math.max(h, 1)}
                        fill={segment.color}
                      />
                    );
                    base = yTop;
                    return element;
                  })}
                  {column.tick && (
                    <text
                      x={x + barW / 2}
                      y={height - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fill={AXIS_TEXT}
                    >
                      {column.tick}
                    </text>
                  )}
                  <rect
                    x={pad.left + i * slot}
                    y={pad.top}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${column.label}: ${series
                      .map((s) => `${s.label} ${column.values[s.key] ?? 0}`)
                      .join(", ")}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </svg>
        )}
        {active !== null && data[active] && (
          <Tooltip
            left={pad.left + active * slot + slot / 2}
            width={width}
            title={data[active].label}
            rows={series.map((s, index) => ({
              color: SERIES_COLORS[index] ?? SURFACE,
              label: s.label,
              value: data[active]?.values[s.key] ?? 0,
            }))}
            note={data[active].note}
          />
        )}
      </div>
      <details className="mt-2">
        <summary className="text-muted hover:text-ink-strong cursor-pointer text-xs">
          View as table
        </summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Day</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
              <th className="py-1 text-right font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((column) => (
              <tr key={column.key} className="border-line border-t">
                <td className="py-1">{column.label}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 text-right">
                    {column.values[s.key] ?? 0}
                  </td>
                ))}
                <td className="text-muted py-1 text-right">{column.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Tooltip({
  left,
  width,
  title,
  rows,
  note,
}: {
  left: number;
  width: number;
  title: string;
  rows: { color: string; label: string; value: number }[];
  note?: string;
}) {
  const boxWidth = 168;
  const x = Math.min(Math.max(left - boxWidth / 2, 0), Math.max(0, width - boxWidth));
  return (
    <div
      role="status"
      className="border-line bg-surface pointer-events-none absolute top-0 z-10 rounded-lg border px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]"
      style={{ left: x, width: boxWidth }}
    >
      <p className="text-muted mb-1">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center justify-between gap-3">
          <span className="text-muted inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-3 rounded-full"
              style={{ background: row.color }}
            />
            {row.label}
          </span>
          <strong className="text-ink-strong tabular-nums">{row.value}</strong>
        </p>
      ))}
      {note && <p className="text-muted border-line mt-1 border-t pt-1">{note}</p>}
    </div>
  );
}

/** One named row per ratio: a label, an aligned bar against 100%, and the figure. */
export function MeterRow({
  label,
  detail,
  percent,
  figure,
}: {
  label: ReactNode;
  detail?: ReactNode;
  percent: number | null;
  figure: ReactNode;
}) {
  const value = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[15rem_minmax(0,1fr)_3.5rem]">
      <div className="min-w-0">
        <div className="text-ink-strong text-sm font-medium">{label}</div>
        {detail && <div className="text-muted text-xs">{detail}</div>}
      </div>
      <div
        className={cx(
          "order-3 col-span-2 h-2 overflow-hidden rounded-full sm:order-none sm:col-span-1",
        )}
        style={{ background: METER_TRACK }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: SERIES_COLORS[0] }}
        />
      </div>
      <div className="text-ink-strong text-right text-sm font-semibold tabular-nums">{figure}</div>
    </li>
  );
}
