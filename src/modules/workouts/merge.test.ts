import { describe, expect, it } from "vitest";
import { mergeWorkouts } from "./merge";
import { emptySet, type ExerciseSnapshot, type WorkoutSnapshot } from "./snapshot";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const done = (id: number, reps: number, at: string) => ({
  ...emptySet(uuid(id)),
  reps,
  weightKg: 100,
  completedAt: at,
});
const ex = (id: number, sets: ReturnType<typeof done>[]): ExerciseSnapshot => ({
  id: uuid(id),
  exerciseId: uuid(900 + id),
  name: `Ex ${id}`,
  measurement: "weight_reps",
  supersetGroup: null,
  restSeconds: null,
  substitutedFromId: null,
  notes: null,
  sets,
});
const workout = (exercises: ExerciseSnapshot[], name = "Push"): WorkoutSnapshot => ({
  id: uuid(1),
  name,
  routineId: null,
  status: "active",
  startedAt: "2026-11-05T08:00:00.000Z",
  finishedAt: null,
  notes: null,
  exercises,
});

describe("merging a workout edited on two devices", () => {
  it("keeps sets and exercises added on either side", () => {
    const phone = workout([
      ex(10, [done(1, 5, "2026-11-05T08:05:00.000Z"), done(2, 5, "2026-11-05T08:08:00.000Z")]),
    ]);
    const laptop = workout(
      [
        ex(10, [done(1, 5, "2026-11-05T08:05:00.000Z"), done(3, 4, "2026-11-05T08:09:00.000Z")]),
        ex(11, []),
      ],
      "Push day",
    );
    const m = mergeWorkouts(phone, laptop);
    expect(m.name).toBe("Push day");
    expect(m.exercises.map((e) => e.id)).toEqual([uuid(10), uuid(11)]);
    expect(m.exercises[0].sets.map((s) => s.id)).toEqual([uuid(1), uuid(3), uuid(2)]);
  });

  it("prefers a completed set, then the later edit", () => {
    const open = { ...emptySet(uuid(1)), reps: 8 };
    const theirs = workout([ex(10, [done(1, 6, "2026-11-05T08:05:00.000Z")])]);
    const mine = workout([ex(10, [open as ReturnType<typeof done>])]);
    expect(mergeWorkouts(theirs, mine).exercises[0].sets[0].reps).toBe(6);

    const later = workout([ex(10, [done(1, 7, "2026-11-05T08:06:00.000Z")])]);
    expect(mergeWorkouts(later, theirs).exercises[0].sets[0].reps).toBe(7);
    expect(mergeWorkouts(theirs, later).exercises[0].sets[0].reps).toBe(7);
  });

  it("is a no-op when both sides match", () => {
    const w = workout([ex(10, [done(1, 5, "2026-11-05T08:05:00.000Z")])]);
    expect(mergeWorkouts(w, structuredClone(w))).toEqual(w);
  });
});
