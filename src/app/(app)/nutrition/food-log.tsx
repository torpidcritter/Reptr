"use client";

import { Droplet, Plus, Trash2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { queuedMessage, sendOrQueue } from "@/lib/outbox";
import { cn } from "@/lib/utils";
import { deleteFoodAction, saveFoodAction } from "./actions";
import { MyFoods, type SavedFood } from "./my-foods";

const meals = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
] as const;
type Meal = (typeof meals)[number]["value"];

export type Food = {
  id: string;
  meal: Meal;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
export type RecentFood = Omit<Food, "id">;

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function FoodLog({
  day,
  foods,
  recent,
  waterMl,
  defaultMeal,
  saved,
}: {
  saved: SavedFood[];
  defaultMeal: Meal;
  day: string;
  foods: Food[];
  recent: RecentFood[];
  waterMl: number;
}) {
  const [pending, start] = useTransition();
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [form, setForm] = useState({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
  const [error, setError] = useState<string | null>(null);
  const [keep, setKeep] = useState(false);

  const add = (f: RecentFood) =>
    start(async () => {
      const res = await sendOrQueue("food", { ...f, day });
      setError(res.error ?? (res.queued ? queuedMessage : null));
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = {
      meal,
      name: form.name,
      calories: Math.round(num(form.calories)),
      proteinG: num(form.proteinG),
      carbsG: num(form.carbsG),
      fatG: num(form.fatG),
    };
    start(async () => {
      const res = await sendOrQueue("food", { ...entry, day });
      if (res.error) return setError(res.error);
      const kept = keep && !res.queued ? await saveFoodAction(entry) : {};
      setError(
        res.queued
          ? queuedMessage
          : kept.error
            ? `Logged, but not saved to your foods: ${kept.error}`
            : null,
      );
      setKeep(false);
      setForm({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
    });
  };

  const water = (ml: number) =>
    start(async () => {
      const res = await sendOrQueue("water", { day, ml });
      setError(res.error ?? (res.queued ? queuedMessage : null));
    });
  const macro = (k: "proteinG" | "carbsG" | "fatG", label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label} (g)</span>
      <Input
        inputMode="decimal"
        type="number"
        min="0"
        step="0.1"
        value={form[k]}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Add food">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            placeholder="What did you eat?"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            aria-label="Food name"
            maxLength={120}
          />
          <Select value={meal} onChange={(e) => setMeal(e.target.value as Meal)} aria-label="Meal">
            {meals.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Calories</span>
            <Input
              inputMode="numeric"
              type="number"
              min="0"
              value={form.calories}
              onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
            />
          </label>
          {macro("proteinG", "Protein")}
          {macro("carbsG", "Carbs")}
          {macro("fatG", "Fat")}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !form.name.trim()}>
            <Plus /> Add
          </Button>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
              className="accent-accent size-4"
            />
            Save to my foods
          </label>
          {error && (
            <p
              role="status"
              className={cn(
                "text-sm",
                error === queuedMessage ? "text-muted-foreground" : "text-danger",
              )}
            >
              {error}
            </p>
          )}
        </div>
      </form>

      <MyFoods foods={saved} day={day} meal={meal} />

      {recent.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Add again
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r.name}
                type="button"
                disabled={pending}
                onClick={() => add({ ...r, meal })}
                className="border-border hover:bg-muted rounded-full border px-3 py-1 text-sm"
              >
                {r.name} <span className="text-muted-foreground">· {r.calories}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {meals.map((m) => {
          const items = foods.filter((f) => f.meal === m.value);
          if (!items.length) return null;
          const kcal = items.reduce((n, f) => n + f.calories, 0);
          return (
            <section key={m.value}>
              <h3 className="mb-1 flex justify-between text-sm font-semibold">
                {m.label} <span className="text-muted-foreground font-normal">{kcal} kcal</span>
              </h3>
              <ul className="divide-border divide-y text-sm">
                {items.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      P {f.proteinG} · C {f.carbsG} · F {f.fatG}
                    </span>
                    <span className="w-16 text-right font-medium tabular-nums">{f.calories}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-danger"
                      onClick={() => start(() => deleteFoodAction(f.id))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!foods.length && <p className="text-muted-foreground text-sm">Nothing logged yet.</p>}
      </div>

      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        <Droplet className="text-accent size-5" />
        <span className="mr-2 text-sm font-medium tabular-nums">
          {(waterMl / 1000).toFixed(2).replace(/0$/, "")} L water
        </span>
        {[250, 500].map((ml) => (
          <Button
            key={ml}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => water(ml)}
          >
            +{ml} ml
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || waterMl <= 0}
          onClick={() => water(-250)}
          aria-label="Remove 250 ml"
        >
          <Undo2 /> 250
        </Button>
      </div>
    </div>
  );
}
