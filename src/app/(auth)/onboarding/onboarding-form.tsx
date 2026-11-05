"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { weekdayNames } from "@/modules/history/schedule";
import { equipmentOptions, experienceLevels, goals } from "@/modules/profile/onboarding";
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

/** A tappable option backed by a real radio or checkbox, so the form posts it as usual. */
function Choice({
  type,
  name,
  value,
  defaultChecked,
  children,
  className,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "has-checked:border-accent has-checked:bg-accent-soft hover:bg-muted flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-colors has-focus-visible:ring-2",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
      {children}
    </label>
  );
}

const steps = [
  { title: "About you", fields: ["displayName", "age", "height", "weight", "unitSystem"] },
  { title: "Your goal", fields: ["goal", "experience"] },
  { title: "Your week", fields: ["trainingDays", "equipment"] },
];

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [step, setStep] = useState(0);
  const e = state.errors ?? {};

  // If the server rejects a field, go back to the step that holds it.
  useEffect(() => {
    const bad = Object.keys(state.errors ?? {});
    const at = steps.findIndex((s) => s.fields.some((f) => bad.includes(f)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a server response
    if (at >= 0) setStep(at);
  }, [state.errors]);

  const last = step === steps.length - 1;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-xs font-medium">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{steps[step].title}</h2>
        <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={cn("h-1 rounded-full", i <= step ? "bg-accent" : "bg-muted")}
            />
          ))}
        </div>
      </div>

      <div className={cn("flex flex-col gap-5", step !== 0 && "hidden")}>
        <Field label="Your name" error={e.displayName}>
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="Age (optional)" error={e.age}>
            <Input name="age" type="number" inputMode="numeric" min="13" max="100" />
          </Field>
          <Field label={units === "metric" ? "Height (cm)" : "Height (in)"} error={e.height}>
            <Input name="height" type="number" inputMode="decimal" step="0.1" min="0" />
          </Field>
          <Field label={units === "metric" ? "Weight (kg)" : "Weight (lb)"} error={e.weight}>
            <Input name="weight" type="number" inputMode="decimal" step="0.1" min="0" />
          </Field>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          Your weight becomes your first weigh-in. Leave anything blank you&apos;d rather not share.
        </p>
      </div>

      <div className={cn("flex flex-col gap-5", step !== 1 && "hidden")}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">What&apos;s your main goal?</legend>
          <div className="grid grid-cols-2 gap-2">
            {goals.map((g, i) => (
              <Choice
                key={g.value}
                type="radio"
                name="goal"
                value={g.value}
                defaultChecked={i === 0}
              >
                {g.label}
              </Choice>
            ))}
          </div>
          {e.goal && <p className="text-danger mt-1 text-sm">{e.goal[0]}</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Training experience</legend>
          <div className="grid grid-cols-3 gap-2">
            {experienceLevels.map((x) => (
              <Choice
                key={x.value}
                type="radio"
                name="experience"
                value={x.value}
                className="flex-col gap-0.5"
              >
                {x.label}
                <span className="text-muted-foreground text-xs font-normal">{x.hint}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={cn("flex flex-col gap-5", step !== 2 && "hidden")}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Which days do you like to train?</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {weekdayNames.map((d, i) => (
              <Choice
                key={d}
                type="checkbox"
                name="trainingDays"
                value={String(i)}
                className="px-0"
              >
                {d.slice(0, 2)}
              </Choice>
            ))}
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            Used for your weekly target. You can plan routines on these days later.
          </p>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">What can you train with?</legend>
          <div className="grid grid-cols-2 gap-2">
            {equipmentOptions.map((x) => (
              <Choice key={x.value} type="checkbox" name="equipment" value={x.value}>
                {x.label}
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        {last ? (
          <Button key="submit" type="submit" size="lg" disabled={pending}>
            {pending ? "Setting up…" : "Start using Reptr"}
          </Button>
        ) : (
          // A separate key stops React reusing this button as the submit button mid-click,
          // which would send the form a step early.
          <Button key="next" type="button" size="lg" onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        )}
        <div className="flex justify-between">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
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
      </div>
    </form>
  );
}
