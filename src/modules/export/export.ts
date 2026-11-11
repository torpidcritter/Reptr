import { asc, eq, getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import {
  auditLog,
  blocks,
  bodyMetrics,
  challengeMembers,
  challenges,
  coachMemories,
  comments,
  coachUsage,
  dailyCheckins,
  followRequests,
  follows,
  exercises,
  foodEntries,
  goals,
  groupMembers,
  groups,
  notifications,
  notificationSettings,
  nutritionTargets,
  personalRecords,
  postLikes,
  posts,
  profiles,
  programs,
  progressPhotos,
  reports,
  routineExercises,
  routines,
  savedFoods,
  socialProfiles,
  socialSanctions,
  userBadges,
  userLevels,
  userGoals,
  waterEntries,
  workoutExercises,
  workouts,
  workoutSets,
} from "@/db/schema";
import type { Database } from "@/db/types";

// "Download your data": every table that holds something a person logged or that was
// recorded about them, in full. A test fails if a table with a user_id column is added
// without being listed here or in `notExported` with a reason.

type Section = { table: PgTable; owner: PgColumn; order?: PgColumn };

/** Section name in the export → where its rows come from. */
export const exportSections = {
  profile: { table: profiles, owner: profiles.userId },
  customExercises: { table: exercises, owner: exercises.ownerId, order: exercises.createdAt },
  routines: { table: routines, owner: routines.userId, order: routines.createdAt },
  routineExercises: { table: routineExercises, owner: routineExercises.userId },
  programs: { table: programs, owner: programs.userId, order: programs.createdAt },
  workouts: { table: workouts, owner: workouts.userId, order: workouts.startedAt },
  workoutExercises: { table: workoutExercises, owner: workoutExercises.userId },
  workoutSets: { table: workoutSets, owner: workoutSets.userId },
  personalRecords: {
    table: personalRecords,
    owner: personalRecords.userId,
    order: personalRecords.achievedAt,
  },
  bodyMetrics: { table: bodyMetrics, owner: bodyMetrics.userId, order: bodyMetrics.recordedAt },
  progressPhotos: { table: progressPhotos, owner: progressPhotos.userId },
  bodyGoals: { table: userGoals, owner: userGoals.userId },
  goals: { table: goals, owner: goals.userId, order: goals.createdAt },
  nutritionTargets: { table: nutritionTargets, owner: nutritionTargets.userId },
  foodEntries: { table: foodEntries, owner: foodEntries.userId },
  waterEntries: { table: waterEntries, owner: waterEntries.userId },
  savedFoods: { table: savedFoods, owner: savedFoods.userId },
  recoveryCheckins: { table: dailyCheckins, owner: dailyCheckins.userId },
  coachMemories: { table: coachMemories, owner: coachMemories.userId },
  coachUsage: { table: coachUsage, owner: coachUsage.userId, order: coachUsage.createdAt },
  accountActivity: { table: auditLog, owner: auditLog.userId, order: auditLog.createdAt },
  socialProfile: { table: socialProfiles, owner: socialProfiles.userId },
  following: { table: follows, owner: follows.followerId, order: follows.createdAt },
  followRequestsSent: {
    table: followRequests,
    owner: followRequests.requesterId,
    order: followRequests.createdAt,
  },
  blocked: { table: blocks, owner: blocks.blockerId, order: blocks.createdAt },
  posts: { table: posts, owner: posts.authorId, order: posts.createdAt },
  likes: { table: postLikes, owner: postLikes.userId, order: postLikes.createdAt },
  comments: { table: comments, owner: comments.authorId, order: comments.createdAt },
  reportsMade: { table: reports, owner: reports.reporterId, order: reports.createdAt },
  groupsOwned: { table: groups, owner: groups.ownerId, order: groups.createdAt },
  groupMemberships: {
    table: groupMembers,
    owner: groupMembers.userId,
    order: groupMembers.joinedAt,
  },
  challengesCreated: {
    table: challenges,
    owner: challenges.creatorId,
    order: challenges.createdAt,
  },
  challengeMemberships: {
    table: challengeMembers,
    owner: challengeMembers.userId,
    order: challengeMembers.joinedAt,
  },
  badges: { table: userBadges, owner: userBadges.userId, order: userBadges.earnedOn },
  level: { table: userLevels, owner: userLevels.userId },
  notifications: {
    table: notifications,
    owner: notifications.userId,
    order: notifications.createdAt,
  },
  notificationSettings: { table: notificationSettings, owner: notificationSettings.userId },
  moderationDecisions: { table: socialSanctions, owner: socialSanctions.userId },
} satisfies Record<string, Section>;

/** Tables with a user column that are deliberately left out, and why. */
export const notExported: Record<string, string> = {
  applied_ops: "Sync bookkeeping: ids of offline changes already applied, no content.",
  rate_limits: "Request counters keyed by hashes, kept for minutes.",
  push_subscriptions: "Browser push addresses and keys: device secrets, not something you logged.",
  device_keys:
    "The key that encrypts Reptr's data on your devices: a secret, not something you logged.",
  identity_tokens:
    "Hashes of the codes that let your devices open your profile: secrets, not something you logged.",
};

export type ExportSection = keyof typeof exportSections;

/** One section's rows, oldest first where there's a natural order. */
export async function sectionRows(db: Database, userId: string, name: ExportSection) {
  const s: Section = exportSections[name];
  const q = db.select().from(s.table).where(eq(s.owner, userId));
  return s.order ? q.orderBy(asc(s.order)) : q;
}

/**
 * The whole export as JSON text, produced one section at a time so a large history is
 * streamed out rather than built in memory all at once. Dates are ISO 8601 in UTC.
 */
export async function* exportJson(db: Database, userId: string) {
  yield `{\n  "format": "reptr-export-v2",\n  "exportedAt": ${JSON.stringify(new Date().toISOString())}`;
  for (const name of Object.keys(exportSections) as ExportSection[]) {
    const rows = await sectionRows(db, userId, name);
    const value = name === "profile" ? (rows[0] ?? null) : rows;
    yield `,\n  ${JSON.stringify(name)}: ${JSON.stringify(value)}`;
  }
  yield `,\n  "notIncluded": ${JSON.stringify(notExported)}\n}\n`;
}

/** Everything at once, for tests and small accounts. */
export async function exportAll(db: Database, userId: string) {
  let text = "";
  for await (const chunk of exportJson(db, userId)) text += chunk;
  return JSON.parse(text) as Record<string, unknown>;
}

/** One row per logged set, with the workout and exercise it belongs to. */
export async function setRows(db: Database, userId: string) {
  return db
    .select({
      date: workouts.startedAt,
      workout: workouts.name,
      status: workouts.status,
      exercise: exercises.name,
      setNumber: workoutSets.setNumber,
      setType: workoutSets.type,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationSeconds: workoutSets.durationSeconds,
      distanceMeters: workoutSets.distanceMeters,
      rpe: workoutSets.rpe,
      rir: workoutSets.rir,
      notes: workoutSets.notes,
      completedAt: workoutSets.completedAt,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, workoutSets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutSets.userId, userId))
    .orderBy(asc(workouts.startedAt), asc(workoutExercises.position), asc(workoutSets.setNumber));
}

/** Spreadsheet downloads: each is one flat table. */
export const csvTables = {
  sets: setRows,
  body: (db: Database, userId: string) => sectionRows(db, userId, "bodyMetrics"),
  food: (db: Database, userId: string) => sectionRows(db, userId, "foodEntries"),
  checkins: (db: Database, userId: string) => sectionRows(db, userId, "recoveryCheckins"),
} as const;
export type CsvTable = keyof typeof csvTables;

/**
 * A text cell that a spreadsheet would run as a formula (=, +, -, @, tab, return) is
 * prefixed with an apostrophe, so opening an export can never execute anything typed
 * into a note or a food name. Numbers are left alone, so -250 ml stays a number.
 */
export function safeCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** RFC 4180 CSV with formula-safe cells. */
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = safeCell(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return (
    [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") +
    "\r\n"
  );
}

/** Table names covered by the export (for the coverage test). */
export const exportedTableNames = () =>
  Object.values(exportSections).map((s) => getTableName(s.table));

/** Does a table hold per-user rows? (A user_id column, or exercises' owner_id.) */
/** Tables holding a person's data: any that points at an account (user, profile or social profile). */
const PERSON_TABLES = new Set(["users", "profiles", "social_profiles"]);
export const hasUserColumn = (t: PgTable) =>
  Object.values(getTableColumns(t)).some((c) => c.name === "user_id" || c.name === "owner_id") ||
  getTableConfig(t).foreignKeys.some((fk) =>
    PERSON_TABLES.has(getTableName(fk.reference().foreignTable)),
  );
