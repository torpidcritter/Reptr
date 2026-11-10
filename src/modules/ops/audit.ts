import { desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { auditLog } from "@/db/schema";
import { log } from "@/lib/log";

export const auditLabels = {
  signed_in: "Signed in",
  signed_out: "Signed out",
  data_exported: "Downloaded your data",
  photo_added: "Added a progress photo",
  photo_deleted: "Deleted a progress photo",
  settings_changed: "Changed settings",
  coach_change: "Confirmed a change from the coach",
  memory_deleted: "Deleted a coach memory",
  program_started: "Started a training block",
  program_ended: "Ended a training block",
  workout_corrected: "Corrected a finished workout",
  workout_deleted: "Deleted a finished workout",
} as const;

export type AuditAction = keyof typeof auditLabels;
type Detail = Record<string, string | number | boolean | null>;

/** Records a sensitive action. Never fails the action itself: a failed write is only logged. */
export async function audit(db: Database, userId: string, action: AuditAction, detail?: Detail) {
  try {
    await db.insert(auditLog).values({ userId, action, detail: detail ?? null });
  } catch (err) {
    log.error("audit_write_failed", { action, err });
  }
}

export async function recentAudit(db: Database, userId: string, limit = 15) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    label: auditLabels[r.action as AuditAction] ?? r.action,
  }));
}
