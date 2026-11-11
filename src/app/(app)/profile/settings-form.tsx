"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cmToIn } from "@/lib/units";
import { cn } from "@/lib/utils";
import { weekdayNames } from "@/modules/history/schedule";
import { equipmentOptions, experienceLevels, goals } from "@/modules/profile/onboarding";
import { saveSettings, type SettingsState } from "./settings-actions";

type Profile = {
  displayName: string | null;
  unitSystem: "metric" | "imperial";
  heightCm: number | null;
  goal: string;
  experience: string | null;
  trainingDays: number[];
  equipment: string[];
  trackNutrition: boolean;
  trackRecovery: boolean;
  defaultRestSeconds: number;
};

function Chip({
  name,
  value,
  checked,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="has-checked:border-accent has-checked:bg-accent-soft hover:bg-muted flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-medium has-focus-visible:ring-2">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="accent-accent mt-1 size-5 shrink-0"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </label>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error && <span className="text-danger text-sm">{error[0]}</span>}
    </label>
  );
}

export function SettingsForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [units, setUnits] = useState(profile.unitSystem);
  const e = state.errors ?? {};
  const height =
    profile.heightCm == null
      ? ""
      : String(
          units === "metric" ? profile.heightCm : Math.round(cmToIn(profile.heightCm) * 10) / 10,
        );

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Units</legend>
        <div className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1">
          {(["metric", "imperial"] as const).map((u) => (
            <label
              key={u}
              className={cn(
                "flex h-10 cursor-pointer items-center justify-center rounded-lg text-sm font-medium",
                units === u ? "bg-card shadow-xs" : "text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="unitSystem"
                value={u}
                checked={units === u}
                onChange={() => setUnits(u)}
                className="sr-only"
              />
              {u === "metric" ? "kg / cm" : "lb / in"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4">
        <Field label={`Height (${units === "metric" ? "cm" : "in"})`} error={e.height}>
          <Input
            key={units}
            name="height"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            defaultValue={height}
          />
        </Field>
      </div>

      <Field label="Main goal" error={e.goal}>
        <Select name="goal" defaultValue={profile.goal}>
          {goals.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Experience" error={e.experience}>
          <Select name="experience" defaultValue={profile.experience ?? ""}>
            <option value="">Prefer not to say</option>
            {experienceLevels.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Default rest (seconds)" error={e.defaultRestSeconds}>
          <Input
            name="defaultRestSeconds"
            type="number"
            inputMode="numeric"
            min="0"
            max="1800"
            step="15"
            defaultValue={profile.defaultRestSeconds}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Training days</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {weekdayNames.map((d, i) => (
            <Chip
              key={d}
              name="trainingDays"
              value={String(i)}
              checked={profile.trainingDays.includes(i)}
            >
              {d.slice(0, 2)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Equipment you can use</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {equipmentOptions.map((x) => (
            <Chip
              key={x.value}
              name="equipment"
              value={x.value}
              checked={profile.equipment.includes(x.value)}
            >
              {x.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Optional tracking</legend>
        <Toggle
          name="trackNutrition"
          label="Nutrition"
          hint="Log food, water and calorie targets. Adds Log food to Today."
          checked={profile.trackNutrition}
        />
        <Toggle
          name="trackRecovery"
          label="Recovery"
          hint="Daily check-ins for sleep, energy and soreness. Adds Check in to Today."
          checked={profile.trackRecovery}
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {state.saved && !pending && <span className="text-muted-foreground text-sm">Saved.</span>}
      </div>
    </form>
  );
}
