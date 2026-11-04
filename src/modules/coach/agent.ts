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
      }) => Promise<{ choices: { message: AssistantMessage }[] }>;
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
- You can't change their data directly. To create a routine or log a weight, call the matching propose_ tool; the app shows the user a confirm button. Say that it's waiting for their confirmation.
- Base programming on well-established principles (progressive overload, roughly 10-20 hard sets per muscle per week for growth, adequate protein around 1.6-2.2 g/kg, sleep). Don't oversell precision.
- You are not a doctor. For pain, injury, illness, disordered eating or medication questions, give general safety guidance and recommend a qualified professional.`;
}

const MAX_STEPS = 6;

/** Runs one user turn: lets the model call tools until it answers, collecting proposals. */
export async function runCoach(
  client: ChatClient,
  model: string,
  ctx: CoachContext,
  system: string,
  history: Turn[],
) {
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...history.slice(-20)];
  const proposals: Proposal[] = [];
  const toolsUsed: string[] = [];
  const definitions = toolDefinitions();

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.chat.completions.create({
      model,
      messages,
      tools: definitions,
      temperature: 0.4,
    });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) {
      return {
        reply: msg.content?.trim() || "Sorry, I couldn't come up with an answer.",
        proposals,
        toolsUsed,
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
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.result) });
    }
  }
  return {
    reply: "That took more steps than I allow for one answer. Could you ask something narrower?",
    proposals,
    toolsUsed,
  };
}
