"use client";

import dynamic from "next/dynamic";

/** The chat keeps its history in this browser, so it renders on the client only. */
export const CoachChatLoader = dynamic(() => import("./chat").then((m) => m.CoachChat), {
  ssr: false,
  loading: () => <p className="text-muted-foreground text-sm">Loading…</p>,
});
