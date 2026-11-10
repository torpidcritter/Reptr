import { db } from "@/db";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { csvTables, type CsvTable, exportJson, toCsv } from "@/modules/export/export";
import { audit } from "@/modules/ops/audit";

/**
 * Downloads the user's data.
 * - ?format=json: everything, streamed section by section.
 * - ?format=csv&table=sets|body|food|checkins: one flat table for spreadsheets.
 * Reads run as the user (row-level security on), so even a mistake in a query can't
 * put someone else's rows in a download.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const busy = await overLimit(user.id, "export");
  if (busy) return new Response(busy, { status: 429, headers: { "Retry-After": "600" } });
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "csv" ? "csv" : "json";
  const table = (params.get("table") ?? "sets") as CsvTable;
  if (format === "csv" && !(table in csvTables))
    return new Response("Unknown table", { status: 400 });
  await audit(db, user.id, "data_exported", { format, table: format === "csv" ? table : null });
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store, private" };

  if (format === "csv") {
    const rows = await withUser(db, user.id, (tx) => csvTables[table](tx, user.id));
    return new Response(toCsv(rows as Record<string, unknown>[]), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reptr-${table}-${stamp}.csv"`,
      },
    });
  }

  // One transaction for the whole download, so every section is from the same moment.
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await withUser(db, user.id, async (tx) => {
          for await (const chunk of exportJson(tx, user.id))
            controller.enqueue(encoder.encode(chunk));
        });
        controller.close();
      } catch (err) {
        log.error("export_failed", { err });
        controller.error(err);
      }
    },
  });
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="reptr-export-${stamp}.json"`,
    },
  });
}
