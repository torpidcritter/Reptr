// Which muscles are still recovering from recent training. A rough model: a muscle needs
// about two days after a session, a bit longer for big muscles and long sessions. Soreness
// the user reports overrides it. It's a planning aid, not physiology.

export const mapMuscles = [
  "chest",
  "front-delts",
  "side-delts",
  "rear-delts",
  "lats",
  "upper-back",
  "lower-back",
  "biceps",
  "triceps",
  "abs",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
] as const;

export const muscleSlugs = [
  ...mapMuscles,
  "upper-chest",
  "traps",
  "forearms",
  "obliques",
  "adductors",
  "abductors",
] as const;

const large = new Set([
  "chest",
  "lats",
  "upper-back",
  "quads",
  "hamstrings",
  "glutes",
  "lower-back",
]);

export type MuscleSet = {
  workoutId: string;
  at: Date;
  muscle: string;
  role: "primary" | "secondary";
};

export type MuscleStatus = {
  muscle: string;
  status: "ready" | "recovering" | "sore";
  /** Hours until it's likely recovered, when still recovering. */
  hoursLeft: number;
  lastTrained: Date | null;
};

/** Hours a muscle needs after a session with `sets` (secondary sets count half). */
export function recoveryHours(muscle: string, sets: number) {
  const base = large.has(muscle) ? 60 : 48;
  return Math.min(96, base + Math.max(0, sets - 6) * 4);
}

export function recoveryMap(sets: MuscleSet[], now: Date, sore: string[]): MuscleStatus[] {
  // muscle -> its latest session: when and how many (weighted) sets
  const latest = new Map<string, { workoutId: string; at: Date; sets: number }>();
  for (const s of sets) {
    const w = s.role === "primary" ? 1 : 0.5;
    const cur = latest.get(s.muscle);
    if (!cur || s.at > cur.at) {
      if (cur?.workoutId === s.workoutId) cur.sets += w;
      else latest.set(s.muscle, { workoutId: s.workoutId, at: s.at, sets: w });
    } else if (cur.workoutId === s.workoutId) cur.sets += w;
  }
  const soreSet = new Set(sore);
  return mapMuscles.map((muscle) => {
    const l = latest.get(muscle);
    const left = l
      ? Math.max(0, recoveryHours(muscle, l.sets) - (now.getTime() - l.at.getTime()) / 3600000)
      : 0;
    return {
      muscle,
      status: soreSet.has(muscle) ? "sore" : left > 0 ? "recovering" : "ready",
      hoursLeft: Math.ceil(left),
      lastTrained: l?.at ?? null,
    };
  });
}
