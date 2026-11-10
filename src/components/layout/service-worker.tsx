"use client";

import { useEffect } from "react";
import { useWorkoutStore } from "@/lib/workout-store";

/**
 * Registers the offline service worker in production builds, versioned by build, and
 * lets a new version take over only when no workout is in progress on this device.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const build = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    let reg: ServiceWorkerRegistration | undefined;

    const activateWhenSafe = () => {
      const waiting = reg?.waiting;
      const s = useWorkoutStore.getState();
      if (waiting && s.hydrated && !s.workout) waiting.postMessage({ type: "SKIP_WAITING" });
    };

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(build)}`, { scope: "/" })
      .then((r) => {
        reg = r;
        r.addEventListener("updatefound", () =>
          r.installing?.addEventListener("statechange", activateWhenSafe),
        );
        activateWhenSafe();
      })
      .catch(() => {});
    // Once the workout is finished (or there wasn't one), let a waiting update in.
    return useWorkoutStore.subscribe((s, prev) => {
      if ((prev.workout && !s.workout) || (s.hydrated && !prev.hydrated)) activateWhenSafe();
    });
  }, []);
  return null;
}
