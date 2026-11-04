"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cmToIn } from "@/lib/units";
import { cn } from "@/lib/utils";
import { experienceLevels, goals } from "@/modules/profile/onboarding";
import { saveSettings, type SettingsState } from "./settings-actions";

type Profile = {
  displayName: string | null;
  unitSystem: "metric" | "imperial";
  heightCm: number | null;
  goal: string;
  experience: string | null;
  trainingDaysPerWeek: number | null;
  defaultRestSeconds: number;
};

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
      <Field label="Name" error={e.displayName}>
        <Input name="displayName" defaultValue={profile.displayName ?? ""} maxLength={60} />
      </Field>

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

      <div className="grid grid-cols-2 gap-4">
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
        <Field label="Training days a week" error={e.trainingDaysPerWeek}>
          <Input
            name="trainingDaysPerWeek"
            type="number"
            inputMode="numeric"
            min="1"
            max="7"
            defaultValue={profile.trainingDaysPerWeek ?? ""}
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {state.saved && !pending && <span className="text-muted-foreground text-sm">Saved.</span>}
      </div>
    </form>
  );
}
