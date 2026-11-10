import { CheckCircle2, Flag, Users } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatVolume } from "@/lib/format";
import type { UnitSystem } from "@/lib/units";
import type { ChallengeSummary, Metric } from "@/modules/community/challenges";

/** A challenge score in the reader's units: "8 workouts", "12,400 kg", "95 min". */
export function metricText(metric: Metric, value: number, units: UnitSystem) {
  if (metric === "volume") return formatVolume(value, units);
  if (metric === "minutes") return `${Math.round(value).toLocaleString("en")} min`;
  const n = Math.round(value);
  const word = metric === "workouts" ? "workout" : "set";
  return `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;
}

const dayText = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

export function dateRange(c: Pick<ChallengeSummary, "startsOn" | "endsOn">) {
  return c.startsOn === c.endsOn
    ? dayText(c.startsOn)
    : `${dayText(c.startsOn)} – ${dayText(c.endsOn)}`;
}

export function ChallengeCard({ c, units }: { c: ChallengeSummary; units: UnitSystem }) {
  const pct =
    c.target && c.myScore != null ? Math.min(100, Math.round((c.myScore / c.target) * 100)) : null;
  const ended = c.endsOn < new Date().toISOString().slice(0, 10);
  return (
    <Link href={`/challenges/${c.id}`} className="block">
      <Card className="hover:bg-muted flex flex-col gap-2 transition-colors">
        <div className="flex items-start gap-3">
          <Flag className="text-accent mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{c.title}</p>
            <p className="text-muted-foreground text-xs">
              {dateRange(c)}
              {ended && " · ended"}
              {c.groupName && ` · ${c.groupName}`}
              {c.seasonal && " · seasonal"}
            </p>
          </div>
          {c.completed ? (
            <CheckCircle2 aria-label="Completed" className="text-accent size-5 shrink-0" />
          ) : (
            <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
              <Users className="size-3.5" aria-hidden /> {c.participants}
            </span>
          )}
        </div>
        {c.joined && c.myScore != null && (
          <div className="flex flex-col gap-1">
            <p className="text-sm">
              {metricText(c.metric, c.myScore, units)}
              {c.target ? ` of ${metricText(c.metric, c.target, units)}` : ""}
            </p>
            {pct != null && (
              <div
                role="progressbar"
                aria-label="Progress"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="bg-muted h-2 overflow-hidden rounded-full"
              >
                <div className="bg-accent h-full rounded-full" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}
