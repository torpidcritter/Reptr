// Starting-point targets from body weight and goal. They're estimates to adjust from:
// if the weight trend doesn't move the way the goal needs after 2-3 weeks, change calories.

export type Targets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};

export type Goal = "all_round" | "hypertrophy" | "strength" | "recomposition" | "conditioning";

const calorieFactor: Record<Goal, number> = {
  all_round: 1,
  strength: 1.05,
  hypertrophy: 1.1, // a modest surplus
  recomposition: 0.85, // a moderate deficit
  conditioning: 1,
};

const proteinPerKg: Record<Goal, number> = {
  all_round: 1.6,
  strength: 1.8,
  hypertrophy: 1.8,
  recomposition: 2.2, // higher protein protects muscle in a deficit
  conditioning: 1.6,
};

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Maintenance is estimated at ~31 kcal per kg for someone training 3-5 days a week. */
export function suggestTargets(weightKg: number, goal: Goal): Targets {
  const calories = round(weightKg * 31 * calorieFactor[goal], 50);
  const proteinG = round(weightKg * proteinPerKg[goal], 5);
  const fatG = round(Math.max(weightKg * 0.8, (calories * 0.25) / 9), 5);
  const carbsG = Math.max(0, round((calories - proteinG * 4 - fatG * 9) / 4, 5));
  const waterMl = round(weightKg * 35, 250);
  return { calories, proteinG, carbsG, fatG, waterMl };
}

/** Calories from macros (4/4/9), for checking an entry or showing a split. */
export const kcalFromMacros = (p: number, c: number, f: number) =>
  Math.round(p * 4 + c * 4 + f * 9);
