"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";

const reportSchema = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(200),
});

/** Records an error that the browser hit, so it shows up next to the server's logs. */
export async function reportClientError(report: unknown) {
  const user = await getUser();
  if (!user) return;
  const r = reportSchema.safeParse(report);
  if (!r.success || (await overLimit(user.id, "clientError"))) return;
  log.error("client_error", { ...r.data, path: r.data.path.split("?")[0] });
}
