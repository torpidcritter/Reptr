import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyWorkout, exerciseFor } from "./start";
import { completedSetCount, recoverAsNewWorkout } from "./recover";
import { workoutSnapshotSchema } from "./snapshot";

const bench = { exerciseId: randomUUID(), name: "Bench", measurement: "weight_reps" as const };
const row = { exerciseId: randomUUID(), name: "Row", measurement: "weight_reps" as const };

function workout() {
  const w = emptyWorkout();
  w.exercises.push(exerciseFor(bench, { sets: 3 }), exerciseFor(row, { sets: 2 }));
  w.exercises[0].sets.forEach((s, i) => {
    s.weightKg = 60;
    s.reps = 8;
    s.completedAt = new Date(Date.UTC(2026, 10, 10, 10, i)).toISOString();
  });
  w.exercises[1].sets[0] = {
    ...w.exercises[1].sets[0],
    weightKg: 50,
    reps: 10,
    completedAt: "2026-11-10T10:20:00.000Z",
  };
  return w;
}

describe("recoverAsNewWorkout", () => {
  it("keeps exactly the unsynced sets, in a new finished workout", () => {
    const w = workout();
    const lost = [w.exercises[0].sets[2].id, w.exercises[1].sets[0].id];
    const r = recoverAsNewWorkout(w, lost, randomUUID)!;
    expect(workoutSnapshotSchema.safeParse(r).success).toBe(true);
    expect(r.id).not.toBe(w.id);
    expect(r.status).toBe("completed");
    expect(r.exercises.map((e) => e.name)).toEqual(["Bench", "Row"]);
    expect(r.exercises.flatMap((e) => e.sets.map((s) => s.id))).toEqual(lost);
    // Exercise ids are new: the originals are already on the server.
    expect(r.exercises.map((e) => e.id)).not.toContain(w.exercises[0].id);
    expect(r.finishedAt).toBe("2026-11-10T10:20:00.000Z");
    expect(r.name).toMatch(/this device/);
  });

  it("returns nothing when there's nothing to recover", () => {
    expect(recoverAsNewWorkout(workout(), [], randomUUID)).toBeNull();
  });

  it("counts completed sets", () => {
    expect(completedSetCount(workout())).toBe(4);
    expect(completedSetCount(null)).toBe(0);
  });
});
