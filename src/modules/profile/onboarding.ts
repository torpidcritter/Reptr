import { z } from "zod";
import { inToCm, lbToKg, type UnitSystem } from "@/lib/units";

export const goals = [
  { value: "hypertrophy", label: "Build muscle" },
  { value: "strength", label: "Get stronger" },
  { value: "recomposition", label: "Lose fat" },
  { value: "all_round", label: "General fitness" },
  { value: "conditioning", label: "Athletic performance" },
  { value: "maintenance", label: "Maintain what I have" },
] as const;

export const experienceLevels = [
  { value: "beginner", label: "New to lifting", hint: "Under 1 year" },
  { value: "intermediate", label: "Some experience", hint: "1 to 3 years" },
  { value: "advanced", label: "Experienced", hint: "3+ years" },
] as const;

export const equipmentOptions = [
  { value: "full_gym", label: "Full gym" },
  { value: "barbell", label: "Barbell and rack" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "machines", label: "Machines and cables" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "bands", label: "Resistance bands" },
  { value: "bodyweight", label: "Bodyweight only" },
] as const;

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Enter a number." }).optional(),
);

const thisYear = new Date().getFullYear();

/** Everything is optional except units and goal, so onboarding never blocks the user. */
export const onboardingSchema = z
  .object({
    displayName: z.string().trim().max(60, "Keep it under 60 characters.").optional(),
    unitSystem: z.enum(["metric", "imperial"]),
    age: optionalNumber.pipe(
      z
        .number()
        .int()
        .min(13, "Reptr is for ages 13 and up.")
        .max(100, "Check your age.")
        .optional(),
    ),
    height: optionalNumber,
    weight: optionalNumber,
    goal: z.enum(goals.map((g) => g.value)),
    experience: z
      .enum(experienceLevels.map((e) => e.value))
      .optional()
      .or(z.literal("")),
    trainingDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    equipment: z.array(z.enum(equipmentOptions.map((e) => e.value))).default([]),
  })
  .transform((v) => {
    const days = [...new Set(v.trainingDays)].sort();
    return {
      displayName: v.displayName || null,
      unitSystem: v.unitSystem as UnitSystem,
      // Only the age is asked for, so the birthday is stored as 1 January of that year.
      dateOfBirth: v.age === undefined ? null : `${thisYear - v.age}-01-01`,
      heightCm: v.height === undefined ? null : toHeightCm(v.height, v.unitSystem),
      weightKg: v.weight === undefined ? null : toWeightKg(v.weight, v.unitSystem),
      goal: v.goal,
      experience: v.experience || null,
      trainingDays: days,
      trainingDaysPerWeek: days.length || null,
      equipment: [...new Set(v.equipment)],
    };
  })
  .refine((v) => v.heightCm === null || (v.heightCm >= 100 && v.heightCm <= 250), {
    message: "That height looks off. Check the number and units.",
    path: ["height"],
  })
  .refine((v) => v.weightKg === null || (v.weightKg >= 30 && v.weightKg <= 300), {
    message: "That weight looks off. Check the number and units.",
    path: ["weight"],
  });

/** Reads the form, keeping every ticked weekday and piece of equipment. */
export function onboardingFromForm(form: FormData) {
  return {
    ...Object.fromEntries(form),
    trainingDays: form.getAll("trainingDays"),
    equipment: form.getAll("equipment"),
  };
}

export type OnboardingInput = z.infer<typeof onboardingSchema>;

function toWeightKg(value: number, system: string) {
  const kg = system === "imperial" ? lbToKg(value) : value;
  return Math.round(kg * 10) / 10;
}

function toHeightCm(value: number, system: string) {
  const cm = system === "imperial" ? inToCm(value) : value;
  return Math.round(cm * 10) / 10;
}

/** Rest time between sets, in seconds, used when a routine doesn't set one. */
export const restSchema = z.preprocess(
  (v) => (v === "" || v == null ? 90 : Number(v)),
  z.number().int().min(0, "Rest can't be negative.").max(1800, "Keep rest under 30 minutes."),
);
