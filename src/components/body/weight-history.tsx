"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteMetricAction } from "@/app/(app)/physique/actions";
import { useConfirm } from "@/components/ui/confirm";
import { displayWeight, type UnitSystem, weightUnitLabel } from "@/lib/units";
import type { WeighIn } from "@/modules/body/body";
import { LogWeightButton } from "./log-weight";

const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

/** Every weigh-in, newest first, each with edit and delete. */
export function WeightHistory({ entries, units }: { entries: WeighIn[]; units: UnitSystem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const fmt = (kg: number) => `${displayWeight(kg, units, 1)} ${weightUnitLabel(units)}`;

  return (
    <ul className="divide-y rounded-xl border" aria-label="Weigh-ins">
      {entries.map((e, i) => {
        const prev = entries[i + 1];
        const diff = prev ? e.weightKg - prev.weightKg : null;
        return (
          <li key={e.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {fmt(e.weightKg)}
                {diff != null && Math.abs(diff) >= 0.05 && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {diff > 0 ? "+" : "−"}
                    {displayWeight(Math.abs(diff), units, 1)}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {dateLabel(e.day)}
                {e.time && ` · ${e.time}`}
                {e.note && ` · ${e.note}`}
              </p>
            </div>
            <LogWeightButton units={units} entry={e} variant="ghost" className="size-10 px-0">
              <Pencil aria-hidden />
              <span className="sr-only">Edit weigh-in from {dateLabel(e.day)}</span>
            </LogWeightButton>
            <button
              type="button"
              disabled={pending}
              aria-label={`Delete weigh-in from ${dateLabel(e.day)}`}
              className="text-muted-foreground hover:bg-muted hover:text-danger flex size-10 items-center justify-center rounded-xl"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this weigh-in?",
                  body: `${fmt(e.weightKg)} on ${dateLabel(e.day)}. This can't be undone.`,
                  confirm: "Delete",
                  danger: true,
                });
                if (ok)
                  start(async () => {
                    await deleteMetricAction(e.id);
                    router.refresh();
                  });
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
