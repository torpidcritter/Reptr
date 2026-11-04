"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { inToCm, lbToKg, type UnitSystem, weightUnitLabel } from "@/lib/units";
import { metricLabels, type MetricType, tapeTypes } from "@/modules/body/metrics";
import { logEntryAction } from "./actions";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A check-in: weight, body fat and optional tape measurements for one day. */
export function EntryForm({ units }: { units: UnitSystem }) {
  const [day, setDay] = useState(today);
  const [values, setValues] = useState<Partial<Record<MetricType, string>>>({});
  const [method, setMethod] = useState("scale");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const len = units === "metric" ? "cm" : "in";

  const set = (k: MetricType, v: string) => {
    setSaved(false);
    setValues((s) => ({ ...s, [k]: v }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Partial<Record<MetricType, number>> = {};
    for (const [k, raw] of Object.entries(values) as [MetricType, string][]) {
      const n = Number(raw?.replace(",", "."));
      if (!raw || !Number.isFinite(n) || n <= 0) continue;
      out[k] =
        k === "weight"
          ? units === "metric"
            ? n
            : lbToKg(n)
          : k === "body_fat"
            ? n
            : units === "metric"
              ? n
              : inToCm(n);
    }
    start(async () => {
      const res = await logEntryAction({
        day,
        values: out,
        bodyFatMethod: out.body_fat ? method : null,
      });
      if (res.error) return setError(res.error);
      setError(null);
      setValues({});
      setSaved(true);
    });
  };

  const field = (k: MetricType, unit: string, step = "0.1") => (
    <label key={k} className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {metricLabels[k]} ({unit})
      </span>
      <Input
        inputMode="decimal"
        type="number"
        step={step}
        min="0"
        value={values[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        aria-label={`${metricLabels[k]} in ${unit}`}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Date</span>
          <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
        </label>
        {field("weight", weightUnitLabel(units))}
        {field("body_fat", "%")}
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Body fat measured by</span>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="scale">Smart scale</option>
            <option value="calipers">Calipers</option>
            <option value="dexa">DEXA scan</option>
            <option value="visual">Visual estimate</option>
          </Select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-sm font-medium"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        Tape measurements
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tapeTypes.map((k) => field(k, len))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save check-in"}
        </Button>
        {error && <p className="text-danger text-sm">{error}</p>}
        {saved && !error && <p className="text-muted-foreground text-sm">Saved.</p>}
      </div>
    </form>
  );
}
