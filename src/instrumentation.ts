import type { Instrumentation } from "next";

/** Logs every unhandled server error (pages, route handlers, server actions) as one JSON line. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@/lib/log");
  log.error("request_error", {
    err,
    digest: (err as { digest?: string }).digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    action: request.headers["next-action"] ? true : undefined,
  });
};
