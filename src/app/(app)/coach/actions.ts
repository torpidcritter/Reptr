"use server";

import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { getProfile, getTimeZone, requireUser } from "@/lib/auth";
import { localDay } from "@/modules/analytics/insights";
import { entrySchema, logEntry } from "@/modules/body/body";
import { type ChatClient, runCoach, systemPrompt } from "@/modules/coach/agent";
import type { Proposal } from "@/modules/coach/tools";
import {
  addMemory,
  deleteMemory,
  listMemories,
  MemoryFullError,
  memoryPrompt,
  memorySchema,
} from "@/modules/coach/memory";
import { routineSchema, saveRoutine } from "@/modules/routines/routines";
import { applyProgram, programProposalSchema } from "@/modules/coach/apply-program";

const historySchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
  .min(1)
  .max(60);

export type CoachReply = { reply?: string; proposals?: Proposal[]; error?: string };

export async function askCoachAction(history: unknown): Promise<CoachReply> {
  const user = await requireUser();
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return {
      error: "The coach needs an OpenAI API key. Add OPENAI_API_KEY to the server's environment.",
    };
  const parsed = historySchema.safeParse(history);
  if (!parsed.success || parsed.data.at(-1)!.role !== "user")
    return { error: "Something went wrong with that message." };
  const busy = await overLimit(user.id, "coach", "coachDaily");
  if (busy) return { error: busy };

  const [profile, tz, memories] = await Promise.all([
    getProfile(user.id),
    getTimeZone(),
    listMemories(db, user.id),
  ]);
  const now = new Date();
  const system =
    systemPrompt({
      name: profile?.displayName ?? null,
      units: profile?.unitSystem === "imperial" ? "imperial (lb, in)" : "metric (kg, cm)",
      goal: profile?.goal ?? "all_round",
      today: `${localDay(now, tz)} (${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: tz }).format(now)})`,
    }) + memoryPrompt(memories);
  try {
    const client = new OpenAI({ apiKey: key }) as unknown as ChatClient;
    const out = await runCoach(
      client,
      process.env.OPENAI_MODEL || "gpt-4.1-mini",
      { db, userId: user.id, timeZone: tz, now },
      system,
      parsed.data,
    );
    return { reply: out.reply, proposals: out.proposals };
  } catch (e) {
    const status = (e as { status?: number }).status;
    log.error("coach_failed", { status, err: e });
    return {
      error:
        status === 401
          ? "The OpenAI API key was rejected. Check OPENAI_API_KEY."
          : status === 429
            ? "OpenAI is rate-limiting or out of credit. Try again in a minute."
            : "The coach couldn't answer just now. Try again.",
    };
  }
}

const proposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create_routine"),
    payload: z.object({
      name: z.string(),
      items: z.array(
        z.object({
          exerciseId: z.uuid(),
          targetSets: z.number(),
          targetRepsMin: z.number(),
          targetRepsMax: z.number(),
          restSeconds: z.number().nullable(),
        }),
      ),
    }),
  }),
  z.object({
    kind: z.literal("log_weight"),
    payload: z.object({ day: z.string(), weightKg: z.number() }),
  }),
  z.object({ kind: z.literal("remember"), payload: memorySchema }),
  z.object({ kind: z.literal("create_program"), payload: programProposalSchema }),
]);

/** Carries out a change the coach proposed, after the user confirmed it. Re-validated here. */
export async function confirmProposalAction(
  proposal: unknown,
): Promise<{ done?: string; error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const p = proposalSchema.safeParse(proposal);
  if (!p.success) return { error: "That change couldn't be read." };
  try {
    if (p.data.kind === "create_routine") {
      const routine = routineSchema.parse({
        name: p.data.payload.name,
        items: p.data.payload.items.map((i) => ({ ...i, supersetGroup: null })),
      });
      await saveRoutine(db, user.id, routine);
      revalidatePath("/routines");
      return { done: `Saved "${routine.name}" to your routines.` };
    }
    if (p.data.kind === "create_program") {
      const tz = await getTimeZone();
      const out = await applyProgram(db, user.id, p.data.payload, localDay(new Date(), tz));
      revalidatePath("/routines");
      revalidatePath("/programs");
      revalidatePath("/history");
      return {
        done: `Saved ${out.routines} routine${out.routines === 1 ? "" : "s"} and started "${out.block.name}".`,
      };
    }
    if (p.data.kind === "remember") {
      const added = await addMemory(db, user.id, p.data.payload);
      revalidatePath("/coach");
      return { done: added ? "Saved to the coach's memory." : "The coach already remembers that." };
    }
    const entry = entrySchema.parse({
      day: p.data.payload.day,
      values: { weight: p.data.payload.weightKg },
    });
    await logEntry(db, user.id, entry);
    revalidatePath("/physique");
    revalidatePath("/");
    return { done: "Weight logged." };
  } catch (e) {
    if (e instanceof MemoryFullError) return { error: e.message };
    return { error: "That change didn't pass validation, so nothing was saved." };
  }
}

export async function addMemoryAction(payload: {
  kind: string;
  content: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  const busy = await overLimit(user.id, "write");
  if (busy) return { error: busy };
  const m = memorySchema.safeParse(payload);
  if (!m.success) return { error: m.error.issues[0].message };
  try {
    await addMemory(db, user.id, m.data);
  } catch (e) {
    if (e instanceof MemoryFullError) return { error: e.message };
    throw e;
  }
  revalidatePath("/coach");
  return {};
}

export async function deleteMemoryAction(id: string) {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return;
  await deleteMemory(db, user.id, id);
  revalidatePath("/coach");
}
