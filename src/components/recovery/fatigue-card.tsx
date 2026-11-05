import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FatigueRead } from "@/modules/coach/fatigue";

const headline = {
  fresh: "Well recovered",
  normal: "No sign of build-up",
  building: "Some fatigue building",
  deload: "Time for a lighter week",
  deloading: "Deload week under way",
} as const;

export function FatigueCard({ f }: { f: FatigueRead }) {
  return (
    <Card>
      <CardLabel>Fatigue over recent weeks</CardLabel>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          f.level === "deload" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {headline[f.level]}
      </p>
      <p className="mt-1 text-sm">{f.advice}</p>
      {f.reasons.length > 0 && (
        <ul className="text-muted-foreground mt-2 list-disc pl-5 text-sm">
          {f.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        {f.confidence === "high"
          ? "High confidence: based on training load, session performance, weekly volume and check-ins."
          : f.confidence === "medium"
            ? "Medium confidence. Daily check-ins make this more reliable."
            : "Low confidence: not much data yet. Log workouts and check-ins for a better read."}
      </p>
      {f.level === "deload" && (
        <Link
          href="/programs"
          className="text-accent mt-2 inline-block text-sm font-medium hover:underline"
        >
          Plan a deload in a training block
        </Link>
      )}
    </Card>
  );
}
