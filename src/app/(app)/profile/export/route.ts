import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { exportAll, setRows, toCsv } from "@/modules/export/export";

/** Downloads all of the user's data: ?format=json (everything) or ?format=csv (one row per set). */
export async function GET(request: Request) {
  const user = await requireUser();
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
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
