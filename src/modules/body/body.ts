import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { bodyMetrics, progressPhotos } from "@/db/schema";
import type { Database } from "@/db/types";
import { type MetricType, metricTypes } from "./metrics";
import { zonedInstant } from "./zoned";

export * from "./metrics";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** One check-in: any mix of weight (kg), body fat (%) and tape measurements (cm). */
export const entrySchema = z
  .object({
    day,
    values: z.partialRecord(z.enum(metricTypes), z.number().positive().max(1000)),
    bodyFatMethod: z.enum(["scale", "calipers", "dexa", "visual"]).nullable().default(null),
  })
  .refine((e) => Object.keys(e.values).length > 0, "Enter at least one measurement")
  .refine(
    (e) => e.values.body_fat == null || (e.values.body_fat >= 1 && e.values.body_fat <= 75),
    "Body fat should be between 1 and 75%",
  );
export type Entry = z.infer<typeof entrySchema>;

/**
 * Each reading keeps the person's own day (and time, if they gave one), which is what
 * charts and lists use, plus the real instant in their time zone for ordering. A reading
 * with no time counts as midday.
 */
const when = (day: string, time: string | null, timeZone: string) => ({
  recordedOn: day,
  recordedTime: time,
  recordedAt: zonedInstant(day, time ?? "12:00", timeZone),
});

export async function logEntry(db: Database, userId: string, e: Entry, timeZone = "UTC") {
  const rows = Object.entries(e.values).map(([type, value]) => ({
    userId,
    type: type as MetricType,
    value: value!,
    method: type === "body_fat" ? e.bodyFatMethod : null,
    ...when(e.day, null, timeZone),
  }));
  await db.insert(bodyMetrics).values(rows);
}

/** One weigh-in, at the day and wall-clock time where the person was. */
export const weightSchema = z.object({
  weightKg: z
    .number({ error: "Enter your weight." })
    .min(20, "That weight looks too low. Check the units.")
    .max(400, "That weight looks too high. Check the units."),
  day,
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Pick a time")
    .default("12:00"),
  note: z.string().trim().max(200, "Keep the note under 200 characters.").default(""),
});
export type WeightInput = z.input<typeof weightSchema>;

// A weigh-in at exactly midday is shown without a time, as before.
const weighInWhen = (w: z.infer<typeof weightSchema>, timeZone: string) =>
  when(w.day, w.time === "12:00" ? null : w.time, timeZone);

export async function logWeight(
  db: Database,
  userId: string,
  w: z.infer<typeof weightSchema>,
  timeZone = "UTC",
) {
  const [row] = await db
    .insert(bodyMetrics)
    .values({
      userId,
      type: "weight",
      value: Math.round(w.weightKg * 100) / 100,
      ...weighInWhen(w, timeZone),
      notes: w.note || null,
    })
    .returning({ id: bodyMetrics.id });
  return row.id;
}

/** Changes a weigh-in. Returns false if it isn't this user's. */
export async function updateWeight(
  db: Database,
  userId: string,
  id: string,
  w: z.infer<typeof weightSchema>,
  timeZone = "UTC",
) {
  const rows = await db
    .update(bodyMetrics)
    .set({
      value: Math.round(w.weightKg * 100) / 100,
      ...weighInWhen(w, timeZone),
      notes: w.note || null,
    })
    .where(
      and(eq(bodyMetrics.id, id), eq(bodyMetrics.userId, userId), eq(bodyMetrics.type, "weight")),
    )
    .returning({ id: bodyMetrics.id });
  return rows.length > 0;
}

/** Weigh-ins, newest first, for the history list. */
export async function weightHistory(db: Database, userId: string, limit = 60) {
  const rows = await db
    .select({
      id: bodyMetrics.id,
      value: bodyMetrics.value,
      recordedOn: bodyMetrics.recordedOn,
      recordedTime: bodyMetrics.recordedTime,
      notes: bodyMetrics.notes,
    })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, userId), eq(bodyMetrics.type, "weight")))
    .orderBy(
      desc(bodyMetrics.recordedOn),
      desc(bodyMetrics.recordedTime),
      desc(bodyMetrics.recordedAt),
    )
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    weightKg: r.value,
    day: r.recordedOn,
    time: r.recordedTime?.slice(0, 5) ?? null,
    note: r.notes ?? "",
  }));
}
export type WeighIn = Awaited<ReturnType<typeof weightHistory>>[number];

export async function deleteMetric(db: Database, userId: string, id: string) {
  await db.delete(bodyMetrics).where(and(eq(bodyMetrics.id, id), eq(bodyMetrics.userId, userId)));
}

/** All readings of one type since a date (by the person's own day), oldest first. */
export async function metricSeries(db: Database, userId: string, type: MetricType, since?: Date) {
  const rows = await db
    .select({
      id: bodyMetrics.id,
      value: bodyMetrics.value,
      recordedAt: bodyMetrics.recordedAt,
      day: bodyMetrics.recordedOn,
    })
    .from(bodyMetrics)
    .where(
      and(
        eq(bodyMetrics.userId, userId),
        eq(bodyMetrics.type, type),
        since ? gte(bodyMetrics.recordedOn, since.toISOString().slice(0, 10)) : undefined,
      ),
    )
    .orderBy(
      asc(bodyMetrics.recordedOn),
      asc(bodyMetrics.recordedTime),
      asc(bodyMetrics.recordedAt),
    );
  return rows;
}

/** For each measurement type: the first and the latest reading. */
export async function measurementSummary(db: Database, userId: string) {
  const rows = await db
    .select({
      type: bodyMetrics.type,
      value: bodyMetrics.value,
      recordedAt: bodyMetrics.recordedAt,
    })
    .from(bodyMetrics)
    .where(eq(bodyMetrics.userId, userId))
    .orderBy(asc(bodyMetrics.recordedAt));
  const out = new Map<
    MetricType,
    { first: number; latest: number; latestAt: Date; count: number }
  >();
  for (const r of rows) {
    const cur = out.get(r.type);
    out.set(
      r.type,
      cur
        ? { ...cur, latest: r.value, latestAt: r.recordedAt, count: cur.count + 1 }
        : { first: r.value, latest: r.value, latestAt: r.recordedAt, count: 1 },
    );
  }
  return out;
}

/** The latest check-ins, newest first, for the log list. */
export async function recentEntries(db: Database, userId: string, limit = 30) {
  return db
    .select({
      id: bodyMetrics.id,
      type: bodyMetrics.type,
      value: bodyMetrics.value,
      recordedAt: bodyMetrics.recordedAt,
    })
    .from(bodyMetrics)
    .where(eq(bodyMetrics.userId, userId))
    .orderBy(desc(bodyMetrics.recordedAt), asc(bodyMetrics.type))
    .limit(limit);
}

// Progress photos: the files live in the private "progress-photos" bucket under the
// user's own folder; these rows are the metadata.

export const photoSchema = z.object({
  pose: z.enum(["front", "side", "back"]),
  takenOn: day,
  storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/),
});

export async function addPhoto(db: Database, userId: string, p: z.infer<typeof photoSchema>) {
  if (!p.storagePath.startsWith(`${userId}/`)) throw new Error("Photo is not in your folder");
  const [row] = await db
    .insert(progressPhotos)
    .values({ userId, ...p })
    .returning({ id: progressPhotos.id });
  return row;
}

export async function listPhotos(db: Database, userId: string) {
  return db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.userId, userId))
    .orderBy(desc(progressPhotos.takenOn), asc(progressPhotos.pose));
}

/** One photo's row, to remove its file before the row itself. */
export async function getPhoto(db: Database, userId: string, id: string) {
  const [row] = await db
    .select({ id: progressPhotos.id, storagePath: progressPhotos.storagePath })
    .from(progressPhotos)
    .where(and(eq(progressPhotos.id, id), eq(progressPhotos.userId, userId)));
  return row ?? null;
}

export async function deletePhoto(db: Database, userId: string, id: string) {
  const [row] = await db
    .delete(progressPhotos)
    .where(and(eq(progressPhotos.id, id), eq(progressPhotos.userId, userId)))
    .returning({ storagePath: progressPhotos.storagePath });
  return row ?? null;
}
