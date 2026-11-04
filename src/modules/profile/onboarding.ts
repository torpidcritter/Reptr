import { z } from "zod";
import { inToCm, type UnitSystem } from "@/lib/units";

export const goals = [
  { value: "all_round", label: "All-round fitness" },
  { value: "hypertrophy", label: "Build muscle" },
  { value: "strength", label: "Get stronger" },
  { value: "recomposition", label: "Lose fat, keep muscle" },
  { value: "conditioning", label: "Conditioning and endurance" },
] as const;

export const experienceLevels = [
  { value: "beginner", label: "Under 1 year" },
  { value: "intermediate", label: "1–3 years" },
  { value: "advanced", label: "3+ years" },
] as const;

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number({ error: "Enter a number." }).optional(),
);

/** Everything is optional except units and goal, so onboarding never blocks the user. */
export const onboardingSchema = z
  .object({
    displayName: z.string().trim().max(60, "Keep it under 60 characters.").optional(),
    unitSystem: z.enum(["metric", "imperial"]),
    height: optionalNumber,
    goal: z.enum(goals.map((g) => g.value)),
    experience: z
      .enum(experienceLevels.map((e) => e.value))
      .optional()
      .or(z.literal("")),
    trainingDaysPerWeek: optionalNumber.pipe(
      z.number().int().min(1, "Pick 1 to 7 days.").max(7, "Pick 1 to 7 days.").optional(),
    ),
  })
  .transform((v) => ({
    displayName: v.displayName || null,
    unitSystem: v.unitSystem as UnitSystem,
    heightCm: v.height === undefined ? null : toHeightCm(v.height, v.unitSystem),
    goal: v.goal,
    experience: v.experience || null,
    trainingDaysPerWeek: v.trainingDaysPerWeek ?? null,
  }))
  .refine((v) => v.heightCm === null || (v.heightCm >= 100 && v.heightCm <= 250), {
    message: "That height looks off. Check the number and units.",
    path: ["height"],
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;

function toHeightCm(value: number, system: string) {
  const cm = system === "imperial" ? inToCm(value) : value;
  return Math.round(cm * 10) / 10;
}

/** Rest time between sets, in seconds, used when a routine doesn't set one. */
export const restSchema = z.preprocess(
  (v) => (v === "" || v == null ? 90 : Number(v)),
  z.number().int().min(0, "Rest can't be negative.").max(1800, "Keep rest under 30 minutes."),
);
