"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteSavedFoodAction, logSavedFoodAction, saveRecipeAction } from "./actions";

export type SavedFood = {
  id: string;
  kind: string;
  name: string;
  servingLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** The user's own foods and recipes: pick one, choose servings, add it to the day. */
export function MyFoods({ foods, day, meal }: { foods: SavedFood[]; day: string; meal: string }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const [servings, setServings] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const food = foods.find((f) => f.id === picked);

  const log = () =>
    start(async () => {
      const res = await logSavedFoodAction({ id: picked, servings: num(servings), meal, day });
      if (res.error) return setError(res.error);
      setError(null);
      setPicked(null);
      setServings("1");
    });

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        My foods and recipes
      </p>
      {foods.length ? (
        <div className="flex flex-wrap gap-2">
          {foods.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={picked === f.id}
              onClick={() => setPicked(picked === f.id ? null : f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                picked === f.id ? "border-accent bg-accent-soft" : "border-border hover:bg-muted",
              )}
            >
              {f.name}
              {f.kind === "recipe" && <span className="text-muted-foreground"> · recipe</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Tick &ldquo;Save to my foods&rdquo; when adding a food, or build a recipe below.
        </p>
      )}
      {food && (
        <div className="bg-muted mt-3 flex flex-wrap items-end gap-3 rounded-xl p-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{food.name}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {food.servingLabel}: {food.calories} kcal · P {food.proteinG} · C {food.carbsG} · F{" "}
              {food.fatG}
            </p>
          </div>
          <label className="flex w-24 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Servings</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0.1"
              max="20"
              step="0.25"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </label>
          <Button type="button" disabled={pending} onClick={log}>
            <Plus /> Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${food.name} from my foods`}
            disabled={pending}
            onClick={() =>
              confirm(`Delete "${food.name}" from your foods? Logged entries stay.`) &&
              start(async () => {
                await deleteSavedFoodAction(food.id);
                setPicked(null);
              })
            }
          >
            <Trash2 />
          </Button>
        </div>
      )}
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
      <RecipeBuilder />
    </div>
  );
}

type Row = { name: string; calories: string; proteinG: string; carbsG: string; fatG: string };
const emptyRow = (): Row => ({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });

function RecipeBuilder() {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [msg, setMsg] = useState<string | null>(null);
  const per = Math.max(1, num(servings));
  const total = (k: keyof Omit<Row, "name">) => rows.reduce((n, r) => n + num(r[k]), 0) / per;
  const set = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveRecipeAction({
        name,
        servings: num(servings),
        ingredients: rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name,
            calories: Math.round(num(r.calories)),
            proteinG: num(r.proteinG),
            carbsG: num(r.carbsG),
            fatG: num(r.fatG),
          })),
      });
      if (res.error) return setMsg(res.error);
      setMsg(`Saved "${name}".`);
      setName("");
      setRows([emptyRow()]);
    });
  };

  return (
    <details className="mt-3 text-sm">
      <summary className="text-accent cursor-pointer font-medium">New recipe</summary>
      <form onSubmit={save} className="mt-3 flex flex-col gap-3" aria-label="New recipe">
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Input
            placeholder="Recipe name"
            aria-label="Recipe name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="number"
            inputMode="decimal"
            min="1"
            max="50"
            aria-label="Servings it makes"
            title="Servings it makes"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Ingredients for the whole batch. The recipe is saved per serving.
        </p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_repeat(4,4.25rem)_auto] items-center gap-1.5">
            <Input
              placeholder="Ingredient"
              aria-label={`Ingredient ${i + 1}`}
              value={r.name}
              onChange={(e) => set(i, "name", e.target.value)}
            />
            {(
              [
                ["calories", "kcal"],
                ["proteinG", "P"],
                ["carbsG", "C"],
                ["fatG", "F"],
              ] as const
            ).map(([k, label]) => (
              <Input
                key={k}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder={label}
                aria-label={`Ingredient ${i + 1} ${label}`}
                value={r[k]}
                onChange={(e) => set(i, k, e.target.value)}
              />
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ingredient ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
          >
            <Plus /> Ingredient
          </Button>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            Per serving: {Math.round(total("calories"))} kcal · P {total("proteinG").toFixed(1)} · C{" "}
            {total("carbsG").toFixed(1)} · F {total("fatG").toFixed(1)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={pending || !name.trim() || !rows.some((r) => r.name.trim())}
          >
            Save recipe
          </Button>
          {msg && <span className="text-muted-foreground text-sm">{msg}</span>}
        </div>
      </form>
    </details>
  );
}
