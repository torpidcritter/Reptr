import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when a page isn't cached and there's no connection. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="text-muted-foreground size-10" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-muted-foreground text-sm">
        This page isn&apos;t saved on your device yet. Your workout still works offline and syncs
        when you&apos;re back online.
      </p>
      <Link href="/workout" className="text-accent text-sm font-medium hover:underline">
        Go to your workout
      </Link>
    </main>
  );
}
