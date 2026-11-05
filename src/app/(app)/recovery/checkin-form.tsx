"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveCheckinAction } from "./actions";
import { muscles as muscleList } from "@/db/seed/muscles";
import { mapMuscles } from "@/modules/recovery/muscle-map";

const muscleName = new Map<string, string>(muscleList.map((m) => [m.slug, m.name]));

type Scores = "sleepQuality" | "energy" | "soreness" | "stress";
export type CheckinValues = {
  sleepHours: number | null;
  steps: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  soreMuscles: string[];
} & Record<Scores, number | null>;

const scales: { key: Scores; label: string; low: string; high: string }[] = [
  { key: "sleepQuality", label: "Sleep quality", low: "Awful", high: "Great" },
  { key: "energy", label: "Energy", low: "Drained", high: "Full" },
  { key: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { key: "stress", label: "Stress", low: "Calm", high: "Very stressed" },
];

/** Today's check-in. Every field is optional; the readiness score uses whatever is filled in. */
export function CheckinForm({ day, initial }: { day: string; initial: CheckinValues | null }) {
  const [scores, setScores] = useState<Record<Scores, number | null>>({
    sleepQuality: initial?.sleepQuality ?? null,
    energy: initial?.energy ?? null,
    soreness: initial?.soreness ?? null,
    stress: initial?.stress ?? null,
  });
  const [sleep, setSleep] = useState(initial?.sleepHours?.toString() ?? "");
  const [steps, setSteps] = useState(initial?.steps?.toString() ?? "");
  const [hr, setHr] = useState(initial?.restingHr?.toString() ?? "");
  const [hrv, setHrv] = useState(initial?.hrvMs?.toString() ?? "");
  const [sore, setSore] = useState<string[]>(initial?.soreMuscles ?? []);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = (v: string, int = false) => {
    if (!v.trim()) return null;
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? (int ? Math.round(x) : x) : null;
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveCheckinAction({
        day,
        ...scores,
        sleepHours: n(sleep),
        steps: n(steps, true),
        restingHr: n(hr, true),
        hrvMs: n(hrv, true),
        soreMuscles: sore,
      });
      setMsg(res.error ?? "Saved.");
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Sleep (hours)</span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            max="24"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Steps</span>
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="100"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Resting HR</span>
          <Input
            type="number"
            inputMode="numeric"
            min="25"
            max="200"
            value={hr}
            onChange={(e) => setHr(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">HRV (ms)</span>
          <Input
            type="number"
            inputMode="numeric"
            min="5"
            max="300"
            value={hrv}
            onChange={(e) => setHrv(e.target.value)}
          />
        </label>
      </div>

      {scales.map((s) => (
        <fieldset key={s.key}>
          <legend className="mb-1.5 flex w-full justify-between text-sm font-medium">
            {s.label}
            <span className="text-muted-foreground text-xs font-normal">
              1 {s.low} · 5 {s.high}
            </span>
          </legend>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={scores[s.key] === v}
                aria-label={`${s.label} ${v} of 5`}
                onClick={() => setScores((x) => ({ ...x, [s.key]: x[s.key] === v ? null : v }))}
                className={cn(
                  "h-10 rounded-lg border text-sm font-medium",
                  scores[s.key] === v
                    ? "border-accent bg-accent text-accent-foreground"
                    : "bg-muted hover:border-accent/50 border-transparent",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Sore muscles</legend>
        <div className="flex flex-wrap gap-1.5">
          {mapMuscles.map((m) => {
            const on = sore.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setSore((x) => (on ? x.filter((y) => y !== m) : [...x, m]))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium",
                  on
                    ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-muted hover:border-accent/50 border-transparent",
                )}
              >
                {muscleName.get(m) ?? m}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save check-in"}
        </Button>
        {msg && !pending && <span className="text-muted-foreground text-sm">{msg}</span>}
      </div>
    </form>
  );
}
