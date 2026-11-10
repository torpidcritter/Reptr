import { sql } from "drizzle-orm";
import { check, index, integer, pgPolicy, pgTable, text } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { createdAt, id, isOwner, ownerPolicy, userId } from "./helpers";

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

/**
 * One row per coach answer: tokens used and the estimated cost, so spend can be capped
 * per person and overall, and watched. Users can read their own; only the server writes.
 */
export const coachUsage = pgTable(
  "coach_usage",
  {
    id: id(),
    userId: userId(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    /** Estimated cost in millionths of a US dollar. */
    costMicros: integer("cost_micros").notNull().default(0),
    /** answered, failed, timed_out, too_many_steps */
    outcome: text("outcome").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("coach_usage_user_created_idx").on(t.userId, t.createdAt),
    index("coach_usage_created_idx").on(t.createdAt),
    check("coach_usage_tokens", sql`${t.promptTokens} >= 0 and ${t.completionTokens} >= 0`),
    pgPolicy("coach_usage_owner_read", {
      for: "select",
      to: authenticatedRole,
      using: isOwner(t.userId),
    }),
  ],
);
