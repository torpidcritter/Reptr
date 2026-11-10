import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { coachUsage } from "@/db/schema";
import type { Turn } from "./agent";

// Keeps the coach's cost and latency bounded: how much conversation is sent, how long
// an answer may take, how many tokens a person and the whole app may use per day.

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const coachLimits = () => ({
  /** Most of the visible conversation sent with each question. */
  historyChars: num(process.env.COACH_HISTORY_CHARS, 16_000),
  historyTurns: 20,
  /** Longest single message kept in full. */
  messageChars: 4_000,
  /** Longest tool result passed back to the model. */
  toolResultChars: 6_000,
  /** Cap on each model reply. */
  maxOutputTokens: num(process.env.COACH_MAX_OUTPUT_TOKENS, 900),
  /** Per request to OpenAI, and for the whole answer (below Vercel's function limit). */
  requestTimeoutMs: 25_000,
  answerDeadlineMs: 50_000,
  maxRetries: 1,
  /** Tokens one person may use per day. */
  userDailyTokens: num(process.env.COACH_USER_DAILY_TOKENS, 200_000),
  /** Estimated spend across everyone per day, in US dollars. */
  globalDailyUsd: num(process.env.COACH_DAILY_BUDGET_USD, 5),
});

/**
 * Price per million tokens, in US dollars. Defaults are for gpt-4.1-mini; set
 * COACH_PRICE_INPUT and COACH_PRICE_OUTPUT when using another model.
 */
export const prices = () => ({
  input: num(process.env.COACH_PRICE_INPUT, 0.4),
  output: num(process.env.COACH_PRICE_OUTPUT, 1.6),
});

export function costMicros(promptTokens: number, completionTokens: number, p = prices()) {
  return Math.round(promptTokens * p.input + completionTokens * p.output);
}

/**
 * The part of the conversation that's sent: newest turns first until the budget is used,
 * each long message shortened, and always the question being asked.
 */
export function trimHistory(history: Turn[], limits = coachLimits()): Turn[] {
  const shorten = (t: Turn): Turn =>
    t.content.length > limits.messageChars
      ? { ...t, content: `${t.content.slice(0, limits.messageChars)}… [shortened]` }
      : t;
  const out: Turn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && out.length < limits.historyTurns; i--) {
    const t = shorten(history[i]);
    if (out.length > 0 && used + t.content.length > limits.historyChars) break;
    out.unshift(t);
    used += t.content.length;
  }
  // The model expects the conversation to start with the person, not a reply.
  while (out.length > 1 && out[0].role === "assistant") out.shift();
  return out;
}

/** Shortens a tool result so one lookup can't fill the model's context. */
export function capToolResult(json: string, limit = coachLimits().toolResultChars) {
  return json.length <= limit
    ? json
    : JSON.stringify({ truncated: true, partial: json.slice(0, limit) });
}

/** Why the coach won't answer right now, or null if it may. */
export async function budgetBlock(db: Database, userId: string, limits = coachLimits()) {
  const since = sql`now() - interval '24 hours'`;
  const [mine] = await db
    .select({
      tokens:
        sql<number>`coalesce(sum(${coachUsage.promptTokens} + ${coachUsage.completionTokens}), 0)`.mapWith(
          Number,
        ),
    })
    .from(coachUsage)
    .where(and(eq(coachUsage.userId, userId), gte(coachUsage.createdAt, since)));
  if (mine.tokens >= limits.userDailyTokens) {
    return "You've used today's coach allowance. It resets over the next 24 hours.";
  }
  const [all] = await db
    .select({ micros: sql<number>`coalesce(sum(${coachUsage.costMicros}), 0)`.mapWith(Number) })
    .from(coachUsage)
    .where(gte(coachUsage.createdAt, since));
  if (all.micros >= limits.globalDailyUsd * 1_000_000) {
    return "The coach has reached today's overall limit. Try again tomorrow.";
  }
  return null;
}

export type Usage = { promptTokens: number; completionTokens: number };

export async function recordUsage(
  db: Database,
  userId: string,
  model: string,
  usage: Usage,
  outcome: "answered" | "failed" | "timed_out" | "too_many_steps",
) {
  const cost = costMicros(usage.promptTokens, usage.completionTokens);
  await db.insert(coachUsage).values({ userId, model, ...usage, costMicros: cost, outcome });
  return cost;
}
