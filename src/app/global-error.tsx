"use client";

import { useEffect } from "react";
import { reportClientError } from "./(app)/error-actions";
import "./globals.css";

/**
 * Last-resort screen when the app's outer layout itself fails, so the person sees a
 * plain way out instead of a blank page. It replaces the whole document, so it carries
 * its own <html> and <body> and uses only plain elements.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message.slice(0, 500),
      digest: error.digest,
      path: window.location.pathname,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Reptr couldn&apos;t load</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Nothing you logged is lost: a workout in progress stays saved on this device. Try again,
            or reload the page.
          </p>
          {error.digest && (
            <p className="text-muted-foreground mt-2 font-mono text-xs">Reference {error.digest}</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-medium"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="border-border rounded-lg border px-4 py-2 text-sm"
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
