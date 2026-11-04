"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { categories, measurements } from "@/modules/exercises/custom";
import { createExercise, type NewExerciseState } from "./actions";

type Option = { slug: string; name: string };

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

export function NewExerciseForm({
  muscles,
  equipment,
}: {
  muscles: Option[];
  equipment: Option[];
}) {
  const [state, action, pending] = useActionState<NewExerciseState, FormData>(createExercise, {});
  const e = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Name" error={e.name}>
        <Input name="name" required maxLength={80} placeholder="e.g. Cable Y Raise" />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Type" error={e.category}>
          <Select name="category" defaultValue="resistance">
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What you log" error={e.measurement}>
          <Select name="measurement" defaultValue="weight_reps">
            {measurements.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Equipment" error={e.equipment}>
          <Select name="equipment" defaultValue="">
            <option value="">None</option>
            {equipment.map((q) => (
              <option key={q.slug} value={q.slug}>
                {q.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Main muscle" error={e.primaryMuscle}>
          <Select name="primaryMuscle" defaultValue="" required>
            <option value="" disabled>
              Choose…
            </option>
            {muscles.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Also works (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {muscles.map((m) => (
            <label
              key={m.slug}
              className="has-checked:border-accent has-checked:bg-accent-soft cursor-pointer rounded-full border px-3 py-1.5 text-sm"
            >
              <input type="checkbox" name="secondaryMuscles" value={m.slug} className="sr-only" />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="isUnilateral" className="size-5 accent-(--accent)" />
        One side at a time (log left and right separately)
      </label>

      <Field label="Form cues (optional)" error={e.formCues}>
        <textarea
          name="formCues"
          rows={3}
          maxLength={1000}
          className="bg-background focus-visible:ring-ring rounded-xl border p-3 text-base outline-none focus-visible:ring-2"
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save exercise"}
      </Button>
    </form>
  );
}
