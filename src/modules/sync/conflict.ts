/**
 * Why the server could not take a device's copy of a workout. The device keeps its copy
 * and asks the person what to do; nothing is ever dropped because of one of these.
 *
 * - finished_elsewhere: the workout was finished or ended on another device, and this
 *   device has sets the server never got (`unsyncedSetIds`).
 * - active_elsewhere: another device has a different workout in progress. Only one can
 *   be in progress, and the server won't end someone's workout on its own.
 * - wrong_account: the workout belongs to another account (a shared device).
 */
export type SyncConflict =
  | { kind: "finished_elsewhere"; status: "completed" | "abandoned"; unsyncedSetIds: string[] }
  | { kind: "active_elsewhere"; other: { id: string; name: string; startedAt: string } }
  | { kind: "wrong_account" };
