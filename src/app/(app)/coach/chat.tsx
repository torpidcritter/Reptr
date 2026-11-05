"use client";

import { Check, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/modules/coach/tools";
import { askCoachAction, confirmProposalAction } from "./actions";

type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      proposals?: (Proposal & { state?: "done" | "dismissed"; note?: string })[];
    }
  | { role: "error"; content: string };

const STORAGE_KEY = "reptr-coach-chat";
const starters = [
  "How has my training gone over the last 8 weeks?",
  "Is my bench press still progressing? What should I do next session?",
  "Which muscles am I under-training?",
  "Am I eating enough protein for my goal?",
  "Should I train hard today?",
];

const load = (): Message[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** Light formatting for coach replies: paragraphs, "- " bullet lists and **bold**. */
function Formatted({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b)}
          </p>
        );
      })}
    </div>
  );
}

export function CoachChat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>(load);
  // A link elsewhere in the app can start a question here with ?ask=.
  const [input, setInput] = useState(
    () => new URLSearchParams(window.location.search).get("ask")?.slice(0, 500) ?? "",
  );
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {}
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    start(async () => {
      const history = next
        .filter((m): m is Exclude<Message, { role: "error" }> => m.role !== "error")
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await askCoachAction(history);
      setMessages((m) => [
        ...m,
        res.error
          ? { role: "error", content: res.error }
          : { role: "assistant", content: res.reply!, proposals: res.proposals },
      ]);
    });
  };

  const settle = (mi: number, pi: number, state: "done" | "dismissed", note?: string) =>
    setMessages((ms) =>
      ms.map((m, i) =>
        i === mi && m.role === "assistant"
          ? { ...m, proposals: m.proposals?.map((p, j) => (j === pi ? { ...p, state, note } : p)) }
          : m,
      ),
    );

  const confirm = (mi: number, pi: number, p: Proposal) =>
    start(async () => {
      const res = await confirmProposalAction(p);
      settle(mi, pi, res.done ? "done" : "dismissed", res.done ?? res.error);
    });

  if (!enabled) {
    return (
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">
        <p>
          The coach reads your workouts, body, food and recovery data through Reptr&apos;s own
          analytics, then explains what it means and what to do next. It never changes anything
          without you confirming.
        </p>
        <p>
          To turn it on, add an <code className="bg-muted rounded px-1">OPENAI_API_KEY</code> to the
          app&apos;s server environment (for example in Vercel&apos;s project settings) and
          redeploy.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex flex-1 flex-col gap-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">Ask about your own data, for example:</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="border-border hover:bg-muted rounded-full border px-3 py-1.5 text-left text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, mi) => (
          <div
            key={mi}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              m.role === "user" && "bg-accent text-accent-foreground self-end",
              m.role === "assistant" && "bg-muted self-start",
              m.role === "error" && "border-danger/40 text-danger self-start border",
            )}
          >
            {m.role === "assistant" ? <Formatted text={m.content} /> : m.content}
            {m.role === "assistant" &&
              m.proposals?.map((p, pi) => (
                <div key={pi} className="bg-card border-border mt-3 rounded-xl border p-3">
                  <p className="text-xs font-medium tracking-wide uppercase">Needs your OK</p>
                  <p className="mt-1">{p.summary}</p>
                  {p.state ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {p.note ?? (p.state === "dismissed" ? "Dismissed." : "Done.")}
                    </p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={pending} onClick={() => confirm(mi, pi, p)}>
                        <Check /> Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => settle(mi, pi, "dismissed")}>
                        <X /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
        {pending && (
          <div className="bg-muted text-muted-foreground self-start rounded-2xl px-4 py-2.5 text-sm">
            Looking at your data…
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="bg-background sticky bottom-20 flex gap-2 pt-2 md:bottom-0"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask your coach…"
          aria-label="Message"
          className="bg-muted focus-visible:ring-ring min-h-11 flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Send">
          <Send />
        </Button>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear conversation"
            onClick={() => setMessages([])}
          >
            <Trash2 />
          </Button>
        )}
      </form>
    </div>
  );
}
