"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { niceTicks } from "./scale";

export type Point = { x: number; y: number; label?: string };

type Props = {
  points: Point[];
  /** Accessible name and what the line measures, e.g. "Estimated 1RM". */
  name: string;
  formatY: (v: number) => string;
  formatX: (v: number) => string;
  height?: number;
  color?: string;
  /** Start the y-axis at zero (volume, counts) rather than fitting the data (weights, 1RM). */
  zeroBased?: boolean;
  /** Raw readings drawn as small muted dots behind the line (e.g. daily weigh-ins). */
  dots?: Point[];
  /** Names for the line and the dots; shown as a legend when dots are present. */
  legend?: { line: string; dots: string };
};

const pad = { top: 16, right: 16, bottom: 24, left: 44 };

/**
 * A single-series line chart in plain SVG: 2px line, 10% area wash, end label, and a
 * crosshair tooltip that snaps to the nearest point (pointer and arrow keys).
 */
export function LineChart({
  points,
  name,
  formatY,
  formatX,
  height = 200,
  color = "var(--chart-1)",
  zeroBased = false,
  dots = [],
  legend,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!points.length || !width) return null;
    const xs = [...points, ...dots].map((p) => p.x);
    const ys = [...points, ...dots].map((p) => p.y);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const lo = zeroBased ? 0 : Math.min(...ys);
    const ticks = niceTicks(lo, Math.max(...ys), 4);
    const [y0, y1] = [ticks[0], ticks[ticks.length - 1]];
    const iw = width - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const sx = (x: number) => pad.left + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
    const sy = (y: number) => pad.top + ih - (y1 === y0 ? ih / 2 : ((y - y0) / (y1 - y0)) * ih);
    const pts = points.map((p) => [sx(p.x), sy(p.y)] as const);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("");
    const area = `${line}L${pts[pts.length - 1][0]},${sy(y0)}L${pts[0][0]},${sy(y0)}Z`;
    const dotPts = dots.map((p) => [sx(p.x), sy(p.y)] as const);
    return { pts, dotPts, line, area, ticks, sy, base: sy(y0) };
  }, [points, dots, width, height, zeroBased]);

  const nearest = (clientX: number) => {
    if (!geo || !ref.current) return null;
    const x = clientX - ref.current.getBoundingClientRect().left;
    let best = 0;
    geo.pts.forEach(([px], i) => {
      if (Math.abs(px - x) < Math.abs(geo.pts[best][0] - x)) best = i;
    });
    return best;
  };

  const last = points.length - 1;
  const rawAt = (x: number) => dots.find((d) => d.x === x);
  const shown = active ?? null;

  const chart = (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label={`${name}: ${points.length} points, latest ${points.length ? formatY(points[last].y) : "none"}`}
      tabIndex={points.length ? 0 : -1}
      onPointerMove={(e) => setActive(nearest(e.clientX))}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last + 1) - 1));
        if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? -1) + 1));
        if (e.key === "Escape") setActive(null);
      }}
    >
      {geo && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.14} />
              <stop offset="1" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={geo.sy(t)}
                y2={geo.sy(t)}
                stroke={t === geo.ticks[0] ? "var(--chart-axis)" : "var(--chart-grid)"}
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={geo.sy(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatY(t)}
              </text>
            </g>
          ))}
          <text
            x={pad.left}
            y={height - 6}
            className="fill-muted-foreground text-[11px]"
            textAnchor="start"
          >
            {formatX(points[0].x)}
          </text>
          {last > 0 && (
            <text
              x={width - pad.right}
              y={height - 6}
              className="fill-muted-foreground text-[11px]"
              textAnchor="end"
            >
              {formatX(points[last].x)}
            </text>
          )}
          {points.length > 1 && !dots.length && <path d={geo.area} fill={`url(#${gradient})`} />}
          {geo.dotPts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill="var(--muted-foreground)" opacity={0.45} />
          ))}
          <path
            d={geo.line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {shown != null && (
            <line
              x1={geo.pts[shown][0]}
              x2={geo.pts[shown][0]}
              y1={pad.top}
              y2={geo.base}
              stroke="var(--chart-axis)"
              strokeWidth={1}
            />
          )}
          {(shown != null ? [shown] : [last]).map((i) => (
            <circle
              key={i}
              cx={geo.pts[i][0]}
              cy={geo.pts[i][1]}
              r={4}
              fill={color}
              stroke="var(--card)"
              strokeWidth={2}
            />
          ))}
          {shown == null && (
            <text
              x={geo.pts[last][0] - 8}
              y={geo.pts[last][1] - 10}
              textAnchor="end"
              className="fill-foreground text-xs font-semibold"
            >
              {formatY(points[last].y)}
            </text>
          )}
        </svg>
      )}
      {geo && shown != null && (
        <div
          className="bg-card border-border pointer-events-none absolute top-0 z-10 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(geo.pts[shown][0] - 75, 0), width - 150),
            width: 150,
          }}
        >
          <div className="text-foreground text-sm font-semibold tabular-nums">
            {formatY(points[shown].y)}
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
            {legend ? legend.line : (points[shown].label ?? formatX(points[shown].x))}
          </div>
          {legend && rawAt(points[shown].x) && (
            <div className="text-muted-foreground flex items-center gap-1.5">
              <span className="bg-muted-foreground inline-block size-1.5 rounded-full opacity-60" />
              {legend.dots} {formatY(rawAt(points[shown].x)!.y)}
            </div>
          )}
          {legend && <div className="text-muted-foreground">{formatX(points[shown].x)}</div>}
        </div>
      )}
    </div>
  );

  if (!legend) return chart;
  return (
    <div>
      <div className="text-muted-foreground mb-2 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
          {legend.line}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground inline-block size-1.5 rounded-full opacity-60" />
          {legend.dots}
        </span>
      </div>
      {chart}
    </div>
  );
}
