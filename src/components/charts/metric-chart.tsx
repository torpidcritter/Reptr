"use client";

import { cmToIn, displayWeight, type UnitSystem, weightUnitLabel } from "@/lib/units";
import { LineChart, type Point } from "./line-chart";

export type MetricKind =
  "weight" | "reps" | "duration" | "distance" | "volume" | "count" | "length" | "percent";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Formatters live on the client, so server pages pass a kind instead of functions. */
export function formatMetric(kind: MetricKind, v: number, units: UnitSystem) {
  switch (kind) {
    case "weight":
      return `${displayWeight(v, units, 1)} ${weightUnitLabel(units)}`;
    case "volume": {
      const d = displayWeight(v, units, 0);
      return `${d >= 10000 ? `${Math.round(d / 1000)}K` : Math.round(d).toLocaleString("en")} ${weightUnitLabel(units)}`;
    }
    case "reps":
      return `${v} reps`;
    case "duration":
      return v >= 60
        ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
        : `${v}s`;
    case "distance":
      return units === "metric" ? `${(v / 1000).toFixed(1)} km` : `${(v / 1609.344).toFixed(1)} mi`;
    case "length":
      return units === "metric" ? `${round1(v)} cm` : `${round1(cmToIn(v))} in`;
    case "percent":
      return `${round1(v)}%`;
    case "count":
      return Number.isInteger(v) ? v.toLocaleString("en") : v.toFixed(1);
  }
}

export function MetricChart({
  points,
  kind,
  units,
  name,
  height,
  zeroBased,
  dots,
  legend,
}: {
  points: Point[];
  dots?: Point[];
  legend?: { line: string; dots: string };
  kind: MetricKind;
  units: UnitSystem;
  name: string;
  height?: number;
  zeroBased?: boolean;
}) {
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  return (
    <LineChart
      points={points}
      name={name}
      height={height}
      zeroBased={zeroBased}
      dots={dots}
      legend={legend}
      formatY={(v) => formatMetric(kind, v, units)}
      formatX={(x) => day.format(new Date(x))}
    />
  );
}
