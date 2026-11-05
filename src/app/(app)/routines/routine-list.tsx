import { ListChecks, Play } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { weekdayNames } from "@/modules/history/schedule";
import { listRoutines } from "@/modules/routines/routines";
import { RoutineMenu } from "./routine-menu";

export async function RoutineList() {
  const user = await requireUser();
  const routines = await listRoutines(db, user.id);

  if (routines.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No routines yet"
        body="Build a routine like Push, Pull or Legs so you can start it in one tap."
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {routines.map((r) => (
        <Card key={r.id} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{r.name}</p>
            <p className="text-muted-foreground text-xs">
              {r.exerciseCount} exercises
              {r.scheduleDays.length > 0 &&
                ` · ${r.scheduleDays.map((d) => weekdayNames[d]).join(", ")}`}
            </p>
            <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
              {r.exerciseNames.join(", ")}
            </p>
            <Link
              href={`/workout?routine=${r.id}`}
              className={buttonVariants({ size: "sm", className: "mt-3" })}
            >
              <Play /> Start
            </Link>
          </div>
          <RoutineMenu id={r.id} name={r.name} />
        </Card>
      ))}
    </div>
  );
}
