"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "./error-actions";

/** Shown when a page in the app fails. Your workout in progress is kept on this device. */
export default function AppError({
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
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Nothing you logged is lost: a workout in progress stays saved on this device. Try again, and
        if it keeps happening, it&apos;s been recorded so it can be fixed.
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">Reference {error.digest}</p>
      )}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
