import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, ownerPolicy, userId } from "./helpers";

/**
 * Things the coach should keep in mind across conversations: injuries, preferences,
 * equipment, schedule. The user can see and delete every one.
 */
export const coachMemories = pgTable(
  "coach_memories",
  {
    id: id(),
    userId: userId(),
    /** injury, preference, equipment, schedule or other */
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("coach_memories_user_idx").on(t.userId),
    check(
      "coach_memories_kind",
      sql`${t.kind} in ('injury', 'preference', 'equipment', 'schedule', 'other')`,
    ),
    check("coach_memories_length", sql`char_length(${t.content}) between 1 and 300`),
    ownerPolicy("coach_memories", t.userId),
  ],
);
