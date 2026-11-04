"use client";

import { useState } from "react";

type Row = { muscle: string; name: string; perWeek: number[] };

/** Weighted sets → one of six steps of a single-hue ramp (0 = no work). */
const steps = [0, 3, 6, 10, 15, 20];
const step = (v: number) => {
  if (v <= 0) return 0;
  let s = 1;
  for (let i = 1; i < steps.length; i++) if (v >= steps[i]) s = i;
  return Math.max(1, s);
};

/** Muscles × weeks grid of weighted sets, with a hover/focus readout and a legend. */
export function MuscleHeatmap({ rows, weeks }: { rows: Row[]; weeks: string[] }) {
  const [active, setActive] = useState<{ r: number; w: number } | null>(null);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const label = (w: string) => day.format(new Date(`${w}T00:00:00Z`));
  const a = active && rows[active.r];

  return (
    <div>
      <p className="text-muted-foreground mb-3 h-5 text-sm" aria-live="polite">
        {a ? (
          <>
            <span className="text-foreground font-semibold tabular-nums">
              {a.perWeek[active!.w].toFixed(1).replace(/\.0$/, "")} sets
            </span>{" "}
            · {a.name}, week of {label(weeks[active!.w])}
          </>
        ) : (
          "Weighted sets per week. Hover or tab through for values."
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="sr-only">Muscle</th>
              {weeks.map((w, i) => (
                <th key={w} className="text-muted-foreground p-0 text-[10px] font-normal">
                  {i === 0 || i === weeks.length - 1 ? (
                    label(w)
                  ) : (
                    <span className="sr-only">{label(w)}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.muscle}>
                <th
                  scope="row"
                  className="text-muted-foreground pr-2 text-left text-xs font-normal whitespace-nowrap"
                >
                  {row.name}
                </th>
                {row.perWeek.map((v, w) => (
                  <td
                    key={w}
                    tabIndex={0}
                    aria-label={`${row.name}, week of ${label(weeks[w])}: ${v} sets`}
                    onPointerEnter={() => setActive({ r, w })}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive({ r, w })}
                    onBlur={() => setActive(null)}
                    className="h-5 min-w-3 rounded-[3px] p-0 outline-offset-1 focus-visible:outline-2"
                    style={{
                      background: `var(--heat-${step(v)})`,
                      boxShadow:
                        active?.r === r && active?.w === w
                          ? "0 0 0 2px var(--foreground)"
                          : undefined,
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
        <span>Sets</span>
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className="inline-block size-3 rounded-[3px]"
              style={{ background: `var(--heat-${i})` }}
            />
            {i === 0 ? "0" : i === steps.length - 1 ? `${s}+` : s}
          </span>
        ))}
      </div>
    </div>
  );
}
