import { db } from "@/db";
import { audit } from "@/modules/ops/audit";
import { requireUser } from "@/lib/auth";
import { overLimit } from "@/lib/guard";
import { exportAll, setRows, toCsv } from "@/modules/export/export";

/** Downloads all of the user's data: ?format=json (everything) or ?format=csv (one row per set). */
export async function GET(request: Request) {
  const user = await requireUser();
  const busy = await overLimit(user.id, "export");
  if (busy) return new Response(busy, { status: 429, headers: { "Retry-After": "600" } });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  await audit(db, user.id, "data_exported", { format });
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store" };

  if (format === "csv") {
    return new Response(toCsv(await setRows(db, user.id)), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reptr-sets-${stamp}.csv"`,
      },
    });
  }
  return new Response(JSON.stringify(await exportAll(db, user.id), null, 2), {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="reptr-export-${stamp}.json"`,
    },
  });
}
