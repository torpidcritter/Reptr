"use client";

import { Timer } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useWorkoutStore } from "@/lib/workout-store";
import { formatClock, useNow } from "./use-now";

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    });
  } catch {
    // Audio can be blocked; the vibration and on-screen timer still work.
  }
}

/** Counts down from when a set was completed. Based on an end time, so it survives a refresh. */
export function RestTimer() {
  const rest = useWorkoutStore((s) => s.rest);
  const adjust = useWorkoutStore((s) => s.adjustRest);
  const stop = useWorkoutStore((s) => s.stopRest);
  const now = useNow(250);
  const alerted = useRef<number | null>(null);

  const left = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;

  useEffect(() => {
    if (!rest || left > 0 || alerted.current === rest.endsAt) return;
    alerted.current = rest.endsAt;
    navigator.vibrate?.([200, 100, 200]);
    beep();
    const t = setTimeout(() => {
      if (useWorkoutStore.getState().rest?.endsAt === rest.endsAt) stop();
    }, 4000);
    return () => clearTimeout(t);
  }, [rest, left, stop]);

  if (!rest) return null;
  const progress = rest.duration > 0 ? Math.min(1, Math.max(0, left / rest.duration)) : 0;
  const done = left <= 0;

  return (
    <div
      role="timer"
      aria-live="polite"
      className="bg-card/95 fixed inset-x-0 bottom-16 z-30 border-t backdrop-blur md:bottom-0 md:left-60"
    >
      <div className="bg-muted h-1">
        <div
          className="bg-accent h-1 transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
        <Timer className="text-accent size-5" />
        <span className="flex-1 text-lg font-semibold tabular-nums">
          {done ? "Rest done, next set" : formatClock(left)}
        </span>
        {!done && (
          <>
            <Button variant="secondary" size="sm" onClick={() => adjust(-15)}>
              −15s
            </Button>
            <Button variant="secondary" size="sm" onClick={() => adjust(15)}>
              +15s
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={stop}>
          {done ? "Close" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
