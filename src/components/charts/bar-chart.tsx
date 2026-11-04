"use client";

import { useEffect, useRef, useState } from "react";
import type { UnitSystem } from "@/lib/units";
import { formatMetric, type MetricKind } from "./metric-chart";
import { niceTicks } from "./scale";

export type Bar = { key: string; label: string; value: number; detail?: string };

const pad = { top: 12, right: 4, bottom: 22, left: 44 };

/**
 * Columns from one baseline: capped at 24px wide, 4px rounded top, square at the
 * base, 2px gap between neighbours. Each column is its own hover/focus target.
 */
export function BarChart({
  bars,
  kind,
  units,
  name,
  height = 180,
}: {
  bars: Bar[];
  kind: MetricKind;
  units: UnitSystem;
  name: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = (v: number) => formatMetric(kind, v, units);
  const ticks = niceTicks(0, Math.max(1, ...bars.map((b) => b.value)), 3);
  const top = ticks[ticks.length - 1];
  const iw = Math.max(0, width - pad.left - pad.right);
  const ih = height - pad.top - pad.bottom;
  const band = bars.length ? iw / bars.length : 0;
  const bw = Math.max(2, Math.min(24, band - 2));
  const sy = (v: number) => pad.top + ih - (v / top) * ih;
  const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(iw / 44)));

  return (
    <div ref={ref} className="relative w-full" style={{ height }} role="group" aria-label={name}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={sy(t)}
                y2={sy(t)}
                stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
              />
              <text
                x={pad.left - 8}
                y={sy(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {fmt(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = pad.left + band * i + band / 2;
            const h = Math.max(0, sy(0) - sy(b.value));
            const x = cx - bw / 2;
            const y = sy(0) - h;
            const r = Math.min(4, h, bw / 2);
            return (
              <g
                key={b.key}
                tabIndex={0}
                role="img"
                aria-label={`${b.label}: ${fmt(b.value)}${b.detail ? `, ${b.detail}` : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={ih}
                  fill="transparent"
                />
                {h > 0 && (
                  <path
                    d={`M${x},${sy(0)}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${sy(0)}Z`}
                    fill="var(--chart-1)"
                    opacity={active == null || active === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {active != null && bars[active] && (
        <div
          className="bg-card border-border pointer-events-none absolute top-0 z-10 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(
              Math.max(pad.left + band * active + band / 2 - 70, 0),
              Math.max(0, width - 140),
            ),
            width: 140,
          }}
        >
          <div className="text-foreground text-sm font-semibold tabular-nums">
            {fmt(bars[active].value)}
          </div>
          <div className="text-muted-foreground">
            {bars[active].label}
            {bars[active].detail && ` · ${bars[active].detail}`}
          </div>
        </div>
      )}
    </div>
  );
}
