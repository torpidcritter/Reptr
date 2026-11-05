import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { useWorkoutStore } from "./workout-store";

const store = () => useWorkoutStore.getState();

function startWithBench(sets = 3) {
  const w = emptyWorkout();
  w.exercises.push(
    exerciseFor({ exerciseId: randomUUID(), name: "Bench", measurement: "weight_reps" }, { sets }),
  );
  store().start(w);
  return w.exercises[0].id;
}

const sets = () => store().workout!.exercises[0].sets;

describe("workout store", () => {
  beforeEach(() => store().clear());

  it("repeats the last completed set into the next empty planned set", () => {
    const key = startWithBench(3);
    expect(store().repeatLastSet(key)).toBe(false); // nothing done yet

    store().updateSet(key, sets()[0].id, {
      weightKg: 80,
      reps: 5,
      rpe: 9,
      completedAt: new Date().toISOString(),
    });
    expect(store().repeatLastSet(key)).toBe(true);

    expect(sets()).toHaveLength(3);
    expect(sets()[1]).toMatchObject({ weightKg: 80, reps: 5, rpe: null });
    expect(sets()[1].completedAt).not.toBeNull();

    store().repeatLastSet(key);
    store().repeatLastSet(key); // no planned sets left, so it adds one
    expect(sets()).toHaveLength(4);
    expect(sets().every((s) => s.completedAt)).toBe(true);
  });

  it("undoes a deleted set back into its place", () => {
    const key = startWithBench(3);
    const [a, b, c] = sets().map((s) => s.id);
    store().removeSet(key, b);
    expect(sets().map((s) => s.id)).toEqual([a, c]);

    store().undoRemove();
    expect(sets().map((s) => s.id)).toEqual([a, b, c]);
    expect(store().lastRemoved).toBeNull();
  });
});
