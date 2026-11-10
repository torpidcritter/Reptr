import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { get, set } from "idb-keyval";
import { describe, expect, it, vi } from "vitest";
import { emptyWorkout } from "@/modules/workouts/start";

// The queue's server call isn't used here; the real one pulls in server-only code.
vi.mock("@/app/(app)/outbox-actions", () => ({ applyOpAction: vi.fn() }));
import { useWorkoutStore } from "../workout-store";
import { accountsOnDevice, scopedKey, switchAccount, wipeAccount } from "./scope";

const alice = randomUUID();
const bob = randomUUID();
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("device data per account", () => {
  it("moves data stored before accounts existed to the first account that signs in", async () => {
    const legacy = emptyWorkout();
    await set(
      "reptr-active-workout",
      JSON.stringify({ state: { workout: legacy, revision: 3, syncedRevision: 1 }, version: 0 }),
    );
    await switchAccount(alice);
    expect(useWorkoutStore.getState().workout?.id).toBe(legacy.id);
    expect(await get("reptr-active-workout")).toBeUndefined();
    expect(await get(scopedKey("reptr-active-workout", alice)!)).toBeDefined();
  });

  it("never shows one account's workout to another, and keeps it for its owner", async () => {
    const mine = emptyWorkout();
    useWorkoutStore.getState().start(mine);
    await flush();

    await switchAccount(bob);
    expect(useWorkoutStore.getState().workout).toBeNull();
    const theirs = emptyWorkout();
    useWorkoutStore.getState().start(theirs);
    await flush();

    await switchAccount(alice);
    expect(useWorkoutStore.getState().workout?.id).toBe(mine.id);
    await switchAccount(bob);
    expect(useWorkoutStore.getState().workout?.id).toBe(theirs.id);
    expect((await accountsOnDevice()).sort()).toEqual([alice, bob].sort());
  });

  it("wipes one account's device data and nothing else", async () => {
    await wipeAccount(alice);
    expect(await get(scopedKey("reptr-active-workout", alice)!)).toBeUndefined();
    expect(await get(scopedKey("reptr-active-workout", bob)!)).toBeDefined();
  });
});

describe("offline queue per account", async () => {
  const { useOutbox } = await import("../outbox");

  it("stamps each queued change with the account that made it", async () => {
    await switchAccount(alice);
    useOutbox
      .getState()
      .add({ id: randomUUID(), kind: "water", payload: { day: "2026-11-10", ml: 250 } });
    expect(useOutbox.getState().ops.at(-1)?.owner).toBe(alice);
  });

  it("keeps a refused change until the person retries or removes it", () => {
    const op = useOutbox.getState().ops.at(-1)!;
    useOutbox.getState().fail(op.id, "validation", "Too much water");
    expect(useOutbox.getState().ops).toHaveLength(0);
    expect(useOutbox.getState().failed[0]).toMatchObject({ kind: "validation" });
    useOutbox.getState().retryFailed(op.id);
    expect(useOutbox.getState().ops.map((o) => o.id)).toEqual([op.id]);
  });

  it("backs off a change after a brief failure instead of hammering the server", () => {
    const op = useOutbox.getState().ops[0];
    useOutbox.getState().tried(op.id);
    const after = useOutbox.getState().ops[0];
    expect(after.attempts).toBe(1);
    expect(after.notBefore).toBeGreaterThan(Date.now());
  });

  it("shows another account none of the first account's queue", async () => {
    await switchAccount(bob);
    expect(useOutbox.getState().ops).toHaveLength(0);
    await switchAccount(alice);
    expect(useOutbox.getState().ops).toHaveLength(1);
  });
});
