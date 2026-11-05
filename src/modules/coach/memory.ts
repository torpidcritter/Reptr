import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coachMemories } from "@/db/schema";
import type { Database } from "@/db/types";

import { memoryKinds } from "./memory-kinds";

export { memoryKindLabels, memoryKinds } from "./memory-kinds";
export const MAX_MEMORIES = 50;

export const memorySchema = z.object({
  kind: z.enum(memoryKinds),
  content: z.string().trim().min(1, "Write something to remember.").max(300),
});
export type MemoryInput = z.infer<typeof memorySchema>;

export class MemoryFullError extends Error {}

export async function listMemories(db: Database, userId: string) {
  return db
    .select({ id: coachMemories.id, kind: coachMemories.kind, content: coachMemories.content })
    .from(coachMemories)
    .where(eq(coachMemories.userId, userId))
    .orderBy(asc(coachMemories.createdAt));
}

/** Saves a note, skipping exact duplicates. Returns false when it was already there. */
export async function addMemory(db: Database, userId: string, m: MemoryInput) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(coachMemories)
    .where(eq(coachMemories.userId, userId));
  const [dupe] = await db
    .select({ id: coachMemories.id })
    .from(coachMemories)
    .where(
      and(
        eq(coachMemories.userId, userId),
        sql`lower(${coachMemories.content}) = lower(${m.content})`,
      ),
    );
  if (dupe) return false;
  if (n >= MAX_MEMORIES)
    throw new MemoryFullError(`The coach can remember up to ${MAX_MEMORIES} things.`);
  await db.insert(coachMemories).values({ userId, ...m });
  return true;
}

export async function deleteMemory(db: Database, userId: string, id: string) {
  await db
    .delete(coachMemories)
    .where(and(eq(coachMemories.id, id), eq(coachMemories.userId, userId)));
}

/** The memory block for the coach's system prompt. */
export function memoryPrompt(memories: { kind: string; content: string }[]) {
  if (!memories.length) return "";
  return `\n\nWhat they've asked you to keep in mind (respect these, especially injuries):\n${memories
    .map((m) => `- [${m.kind}] ${m.content}`)
    .join("\n")}`;
}
