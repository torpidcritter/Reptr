"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while a workout is being logged, so the phone doesn't lock between
 * sets. Browsers drop the lock when the tab is hidden, so it's asked for again when the
 * tab comes back. Where the Screen Wake Lock API isn't available, nothing happens.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) return void l.release().catch(() => {});
        lock = l;
        l.addEventListener("release", () => {
          if (lock === l) lock = null;
        });
      } catch {
        // Refused (battery saver, not allowed): the screen just locks as usual.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
