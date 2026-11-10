import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { get, set } from "idb-keyval";
import { describe, expect, it, vi } from "vitest";
import { emptyWorkout } from "@/modules/workouts/start";

// The queue's server call isn't used here; the real one pulls in server-only code.
vi.mock("@/app/(app)/outbox-actions", () => ({ applyOpAction: vi.fn() }));
import { useWorkoutStore } from "../workout-store";
import {
  accountsOnDevice,
  scopedKey,
  switchAccount,
  unreadableData,
  useStorageHealth,
  wipeAccount,
} from "./scope";

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
  const { mutateOutbox, useOutbox } = await import("../outbox");

  it("stamps each queued change with the account that made it", async () => {
    await switchAccount(alice);
    await mutateOutbox((s) =>
      s.add({ id: randomUUID(), kind: "water", payload: { day: "2026-11-10", ml: 250 } }),
    );
    expect(useOutbox.getState().ops.at(-1)?.owner).toBe(alice);
  });

  it("keeps a refused change until the person retries or removes it", async () => {
    const op = useOutbox.getState().ops.at(-1)!;
    await mutateOutbox((s) => s.fail(op.id, "validation", "Too much water"));
    expect(useOutbox.getState().ops).toHaveLength(0);
    expect(useOutbox.getState().failed[0]).toMatchObject({ kind: "validation" });
    await mutateOutbox((s) => s.retryFailed(op.id));
    expect(useOutbox.getState().ops.map((o) => o.id)).toEqual([op.id]);
  });

  it("backs off a change after a brief failure instead of hammering the server", async () => {
    const op = useOutbox.getState().ops[0];
    await mutateOutbox((s) => s.tried(op.id));
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

describe("unreadable device data", () => {
  it("sets a damaged saved workout aside, starts clean and keeps a copy to download", async () => {
    const carol = randomUUID();
    await set(scopedKey("reptr-active-workout", carol)!, '{"state":{"workout":{"id":');
    await switchAccount(carol);
    expect(useWorkoutStore.getState().workout).toBeNull();
    expect(useStorageHealth.getState().unreadable).toContain("reptr-active-workout");
    // The damaged copy is replaced by a clean one; the original is kept aside.
    const saved = await get<string>(scopedKey("reptr-active-workout", carol)!);
    expect(saved == null || JSON.parse(saved).state.workout === null).toBe(true);
    const copy = await unreadableData();
    expect(Object.values(copy!.entries)).toEqual(['{"state":{"workout":{"id":']);

    await wipeAccount(carol);
    expect(Object.keys((await unreadableData())!.entries)).toHaveLength(0);
  });

  it("sets aside a saved workout whose shape the logger can't open", async () => {
    const dan = randomUUID();
    const bad = JSON.stringify({ state: { workout: { id: "x", exercises: "nope" } }, version: 0 });
    await set(scopedKey("reptr-active-workout", dan)!, bad);
    await switchAccount(dan);
    expect(useWorkoutStore.getState().workout).toBeNull();
    expect(Object.values((await unreadableData())!.entries)).toEqual([bad]);
  });
});
