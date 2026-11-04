"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { experienceLevels, goals } from "@/modules/profile/onboarding";
import { completeOnboarding, skipOnboarding, type OnboardingState } from "./actions";

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

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const e = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Name (optional)" error={e.displayName}>
        <Input name="displayName" autoComplete="given-name" maxLength={60} />
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

      <Field
        label={`Height in ${units === "metric" ? "cm" : "inches"} (optional)`}
        error={e.height}
      >
        <Input name="height" type="number" inputMode="decimal" step="0.1" min="0" />
      </Field>

      <Field label="Main goal" error={e.goal}>
        <Select name="goal" defaultValue="all_round">
          {goals.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Training experience (optional)" error={e.experience}>
        <Select name="experience" defaultValue="">
          <option value="">Prefer not to say</option>
          {experienceLevels.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Training days per week (optional)" error={e.trainingDaysPerWeek}>
        <Input name="trainingDaysPerWeek" type="number" inputMode="numeric" min="1" max="7" />
      </Field>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
        <Button
          type="submit"
          variant="ghost"
          formAction={skipOnboarding}
          formNoValidate
          disabled={pending}
        >
          Skip for now
        </Button>
      </div>
    </form>
  );
}
