"use client";

import { hasUnsyncedOps, useOutbox } from "@/lib/outbox";
import { hasUnsyncedWorkout, useWorkoutStore } from "@/lib/workout-store";
import { clearPageCaches, currentAccount, wipeAccount } from "./scope";

// Moments when the signed-in account changes on this device: signing out, deleting the
// account. Both stop syncing first, so nothing is sent halfway through.

let paused = false;

/** True while the account is being switched; the sync loops stand still. */
export const syncPaused = () => paused;

/** Changes this device holds that the server doesn't have yet. */
export function pendingChanges() {
  const o = useOutbox.getState();
  return {
    workout: hasUnsyncedWorkout(),
    ops: o.ops.length,
    failed: o.failed.length,
    any: hasUnsyncedWorkout() || hasUnsyncedOps(),
  };
}

/**
 * Leaves the account on this device. If nothing is waiting to sync, the account's device
 * data is deleted. If something is, it stays stored under this account only (another
 * account can't read or send it) and syncs the next time this account signs in here.
 * Cached pages are always cleared, and the page reloads so no memory carries over.
 */
export async function leaveAccount(signOut: () => Promise<unknown>, keepPending: boolean) {
  paused = true;
  const id = currentAccount();
  try {
    if (id && !(keepPending && pendingChanges().any)) await wipeAccount(id);
    else await clearPageCaches();
    await signOut();
  } finally {
    useWorkoutStore.setState({ workout: null });
    window.location.replace("/login");
  }
}

/** After the account was deleted on the server: remove everything it left on this device. */
export async function forgetDeletedAccount() {
  paused = true;
  const id = currentAccount();
  if (id) await wipeAccount(id);
  window.location.replace("/login?deleted=1");
}

/**
 * Reloads the page to pick up a new version of the app. Everything worth keeping is
 * already in IndexedDB, so this is safe even in the middle of a workout; it waits only
 * for a save to the device that is still in flight.
 */
export async function safeReload() {
  paused = true;
  await new Promise((r) => setTimeout(r, 300));
  window.location.reload();
}
