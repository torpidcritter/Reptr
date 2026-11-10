import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "How scoring works" };

// Mirrors docs/social/LEADERBOARDS.md and public.fitness_workouts() (migration 0029).

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/leaderboards"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Leaderboards
      </Link>
      <PageHeader title="How scoring works" />
      <div className="flex flex-col gap-4 text-sm leading-relaxed">
        <Card>
          <h2 className="mb-2 font-semibold">What counts</h2>
          <p>
            Scores are worked out on the server from the workouts it has saved, never from numbers a
            phone sends. A workout counts when it was finished, lasted between 5 minutes and 6
            hours, and reached the server within 7 days of finishing. Inside it, a set counts when
            it was done and isn&apos;t a warm-up, with a weight from 0 to 500 kg, 0 to 100 reps, and
            no more than 4 hours.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">The boards</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Workouts: how many counted workouts.</li>
            <li>Volume: weight × reps over counted sets.</li>
            <li>Working sets: how many counted sets.</li>
            <li>Training time: workout length, up to 4 hours each.</li>
            <li>
              XP: 50 per workout, plus 2 per set (up to 50) and 10 per personal record (up to 50).
            </li>
            <li>
              Weekly streak: weeks in a row with a counted workout, up to this week or last week.
            </li>
            <li>Lift boards: best estimated one-rep max (Epley formula, sets of 1 to 12 reps).</li>
          </ul>
          <p className="mt-2">
            Weeks start on Monday, and weeks and months are in UTC so everyone is measured over the
            same time. Ties share a rank.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Who appears</h2>
          <p>
            Only people who chose to be on leaderboards in their social profile. You only see people
            whose profile you can see: public accounts, and private accounts you follow. Blocked
            people never appear. Reported numbers can be reviewed, and a moderator can take someone
            off the boards.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Levels</h2>
          <p>
            Your XP sets your level. Level 2 takes 250 XP, level 3 takes 750, level 4 takes 1,500:
            each level needs 125 × level × (level − 1) XP in total.
          </p>
        </Card>
      </div>
    </div>
  );
}
