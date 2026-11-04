"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Targets } from "@/modules/nutrition/targets";
import { saveTargetsAction } from "./actions";

type Values = { [K in keyof Targets]: number | null };

/** Edit daily targets, with a one-tap fill from the suggestion. */
export function TargetsForm({
  current,
  suggested,
}: {
  current: Values;
  suggested: Targets | null;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<keyof Targets, string>>(() => ({
    calories: current.calories?.toString() ?? "",
    proteinG: current.proteinG?.toString() ?? "",
    carbsG: current.carbsG?.toString() ?? "",
    fatG: current.fatG?.toString() ?? "",
    waterMl: current.waterMl?.toString() ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fields: [keyof Targets, string][] = [
    ["calories", "Calories"],
    ["proteinG", "Protein (g)"],
    ["carbsG", "Carbs (g)"],
    ["fatG", "Fat (g)"],
    ["waterMl", "Water (ml)"],
  ];

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit targets
      </Button>
    );
  }

  const save = () => {
    const out = Object.fromEntries(
      fields.map(([k]) => {
        const n = Number(v[k]);
        return [
          k,
          v[k] === "" || !Number.isFinite(n)
            ? null
            : k === "calories" || k === "waterMl"
              ? Math.round(n)
              : n,
        ];
      }),
    );
    start(async () => {
      const res = await saveTargetsAction(out);
      if (res.error) return setError(res.error);
      setError(null);
      setOpen(false);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {fields.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              value={v[k]}
              onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {suggested && (
        <p className="text-muted-foreground text-xs">
          Suggested from your weight and goal: {suggested.calories} kcal, {suggested.proteinG} g
          protein, {suggested.carbsG} g carbs, {suggested.fatG} g fat, {suggested.waterMl} ml water.
          It&apos;s a starting point: if your weight trend isn&apos;t moving the way you want after
          2–3 weeks, adjust calories by 150–250.{" "}
          <button
            type="button"
            className="text-accent font-medium hover:underline"
            onClick={() =>
              setV(
                Object.fromEntries(fields.map(([k]) => [k, String(suggested[k])])) as Record<
                  keyof Targets,
                  string
                >,
              )
            }
          >
            Use these
          </button>
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          Save targets
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </div>
  );
}
