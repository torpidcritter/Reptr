import { capToolResult, coachLimits, trimHistory, type Usage } from "./budget";
import { type CoachContext, type Proposal, runTool, toolDefinitions } from "./tools";

/** The part of the OpenAI client the coach uses, so tests can pass a fake. */
export type ChatClient = {
  chat: {
    completions: {
      create: (req: {
        model: string;
        messages: ChatMessage[];
        tools: ReturnType<typeof toolDefinitions>;
        temperature?: number;
        max_completion_tokens?: number;
      }) => Promise<{
        choices: { message: AssistantMessage }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      }>;
    };
  };
};

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type AssistantMessage = { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

/** What the browser keeps and sends back: only the visible conversation. */
export type Turn = { role: "user" | "assistant"; content: string };

export function systemPrompt(opts: {
  name: string | null;
  units: string;
  goal: string;
  today: string;
}) {
  return `You are Reptr's training coach, talking with ${opts.name ?? "the user"} inside their personal fitness tracker.
Today is ${opts.today}. Their main goal is "${opts.goal}" and they prefer ${opts.units} units.

How you work:
- Ground every claim about their training, body or habits in tool results. Call tools before answering questions about their data. Never invent numbers; if data is missing, say so and suggest what to log.
- Numbers from tools are in kg, cm, ml and grams. Convert to their preferred units when you write them.
- Be direct and practical: lead with the answer, then the why in a sentence or two, then one concrete next step. Use short paragraphs or a short list; no long essays.
- You can't change their data directly. To create a routine, log a weight or remember something, call the matching propose_ tool; the app shows the user a confirm button. Say that it's waiting for their confirmation.
- When they describe a program they want (for example "a 4-day upper/lower for 8 weeks"), look up exercises with find_exercises, then call propose_program once with every routine, its weekdays, and the block length and deload. Keep sets per muscle sensible for their level and recent volume.
- When they mention something lasting (an injury, equipment they have, days they can train, exercises they dislike), offer to remember it with propose_memory.
- Say how sure you are. When a tool returns a confidence label or a small number of sessions or days, pass that on in plain words (for example "based on only 3 sessions, so treat this as a rough read").
- Base programming on well-established principles (progressive overload, roughly 10-20 hard sets per muscle per week for growth, adequate protein around 1.6-2.2 g/kg, sleep). Don't oversell precision.
- You are not a doctor. For pain, injury, illness, disordered eating or medication questions, give general safety guidance and recommend a qualified professional.`;
}

const MAX_STEPS = 6;

export class CoachTimeoutError extends Error {}

/**
 * Runs one user turn: lets the model call tools until it answers, collecting proposals.
 * Bounded on every side: the history sent, each reply's length, each tool result's size,
 * the number of steps and the total time. Token usage is returned even on failure.
 */
export async function runCoach(
  client: ChatClient,
  model: string,
  ctx: CoachContext,
  system: string,
  history: Turn[],
  limits = coachLimits(),
) {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...trimHistory(history, limits),
  ];
  const proposals: Proposal[] = [];
  const toolsUsed: string[] = [];
  const definitions = toolDefinitions();
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const deadline = Date.now() + limits.answerDeadlineMs;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (Date.now() > deadline)
      throw Object.assign(new CoachTimeoutError("Coach took too long"), { usage });
    const res = await client.chat.completions.create({
      model,
      messages,
      tools: definitions,
      temperature: 0.4,
      max_completion_tokens: limits.maxOutputTokens,
    });
    usage.promptTokens += res.usage?.prompt_tokens ?? 0;
    usage.completionTokens += res.usage?.completion_tokens ?? 0;
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) {
      return {
        reply: msg.content?.trim() || "Sorry, I couldn't come up with an answer.",
        proposals,
        toolsUsed,
        usage,
        outcome: "answered" as const,
      };
    }
    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      toolsUsed.push(call.function.name);
      let out: Awaited<ReturnType<typeof runTool>>;
      try {
        out = await runTool(ctx, call.function.name, call.function.arguments);
      } catch {
        out = { result: { error: "That lookup failed. Try a different question." } };
      }
      if (out.proposal) proposals.push(out.proposal);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: capToolResult(JSON.stringify(out.result), limits.toolResultChars),
      });
    }
  }
  return {
    reply: "That took more steps than I allow for one answer. Could you ask something narrower?",
    proposals,
    toolsUsed,
    usage,
    outcome: "too_many_steps" as const,
  };
}
