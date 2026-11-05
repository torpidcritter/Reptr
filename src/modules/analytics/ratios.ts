// Strength relative to body weight for the main barbell lifts.

/** Common gym milestones as multiples of body weight. Rough markers, not standards. */
export const mainLifts = [
  { slug: "barbell-bench-press", name: "Bench press", milestones: [1, 1.25, 1.5] },
  { slug: "barbell-back-squat", name: "Squat", milestones: [1.25, 1.5, 2] },
  { slug: "deadlift", name: "Deadlift", milestones: [1.5, 2, 2.5] },
  { slug: "overhead-press", name: "Overhead press", milestones: [0.5, 0.75, 1] },
] as const;

export type LiftBest = { slug: string; exerciseId: string; e1rm: number | null };

export function strengthRatios(bests: LiftBest[], bodyweightKg: number | null) {
  return mainLifts.flatMap((lift) => {
    const b = bests.find((x) => x.slug === lift.slug);
    if (!b?.e1rm) return [];
    const ratio = bodyweightKg ? b.e1rm / bodyweightKg : null;
    const next = ratio == null ? null : (lift.milestones.find((m) => m > ratio) ?? null);
    return [
      {
        name: lift.name,
        exerciseId: b.exerciseId,
        e1rm: b.e1rm,
        ratio,
        reached: ratio == null ? [] : lift.milestones.filter((m) => m <= ratio),
        next,
        /** Weight still needed for the next milestone, in kg. */
        toNext: next != null && bodyweightKg ? next * bodyweightKg - b.e1rm : null,
      },
    ];
  });
}
