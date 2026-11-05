// Accumulated fatigue over weeks, as opposed to day-to-day readiness. Several weak signals
// are combined; each one that fires adds a reason. The more kinds of data there are, the
// more confident the read. It suggests when a deload may help, nothing stronger.

export type FatigueInput = {
  /** Acute:chronic ratio of working sets (this week vs 4-week average). */
  loadRatio: number | null;
  monotony: number | null;
  /** Performance scores (percent vs recent sessions) of the latest sessions, oldest first. */
  recentPerformance: number[];
  /** Working sets per week for the last 12 weeks, oldest first, ending with this week. */
  weeklySets: number[];
  /** Daily check-ins for the last 28 days. */
  checkins: {
    day: string;
    sleepHours: number | null;
    energy: number | null;
    soreness: number | null;
  }[];
  today: string;
  /** True when the current training block is in a deload week. */
  inDeload: boolean;
};

export type FatigueLevel = "fresh" | "normal" | "building" | "deload" | "deloading";

export type FatigueRead = {
  level: FatigueLevel;
  score: number;
  reasons: string[];
  advice: string;
  confidence: "low" | "medium" | "high";
  /** Consecutive full weeks of normal-or-harder training. */
  hardWeeks: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Full weeks in a row (excluding this one) at 60% or more of the typical training week. */
export function hardWeeksInARow(weeklySets: number[]) {
  const full = weeklySets.slice(0, -1);
  const trained = full.filter((n) => n > 0).sort((a, b) => a - b);
  if (trained.length < 3) return 0;
  const typical = trained[Math.floor(trained.length / 2)];
  let n = 0;
  for (let i = full.length - 1; i >= 0 && full[i] >= 0.6 * typical; i--) n++;
  return n;
}

export function assessFatigue(input: FatigueInput): FatigueRead {
  let score = 0;
  let sources = 0;
  const reasons: string[] = [];

  if (input.loadRatio != null) {
    sources++;
    if (input.loadRatio > 1.5) {
      score += 2;
      reasons.push(`This week's load is ${input.loadRatio.toFixed(1)}× your 4-week average`);
    } else if (input.loadRatio > 1.3) {
      score += 1;
      reasons.push("This week is noticeably harder than your recent average");
    }
  }
  if (input.monotony != null && input.monotony > 2) {
    score += 1;
    reasons.push("Training load has been very similar day to day, with little easy time");
  }

  const perf = input.recentPerformance.slice(-4);
  if (perf.length >= 3) {
    sources++;
    const m = mean(perf)!;
    if (m < -2) {
      score += 2;
      reasons.push(
        `Your last ${perf.length} sessions were ${Math.abs(m).toFixed(1)}% below your recent level`,
      );
    } else if (m < -1) {
      score += 1;
      reasons.push("Your recent sessions have dipped slightly");
    }
  }

  const hardWeeks = hardWeeksInARow(input.weeklySets);
  if (input.weeklySets.filter((n) => n > 0).length >= 4) {
    sources++;
    if (hardWeeks >= 8) {
      score += 2;
      reasons.push(`${hardWeeks} hard weeks in a row without a lighter one`);
    } else if (hardWeeks >= 6) {
      score += 1;
      reasons.push(`${hardWeeks} hard weeks in a row`);
    }
  }

  // Last 7 days of check-ins against the 3 weeks before.
  const weekStart = addDays(input.today, -6);
  const recent = input.checkins.filter((c) => c.day >= weekStart);
  const before = input.checkins.filter((c) => c.day < weekStart);
  const avg = (rows: typeof recent, k: "sleepHours" | "energy" | "soreness") =>
    mean(rows.map((r) => r[k]).filter((v): v is number => v != null));
  if (recent.length >= 3 && before.length >= 5) {
    sources++;
    const d = (k: "sleepHours" | "energy" | "soreness") => {
      const a = avg(recent, k);
      const b = avg(before, k);
      return a != null && b != null ? a - b : null;
    };
    const sleep = d("sleepHours");
    const energy = d("energy");
    const soreness = d("soreness");
    if (sleep != null && sleep <= -0.75) {
      score += 1;
      reasons.push(`Sleeping about ${Math.abs(sleep).toFixed(1)} h less than usual this week`);
    }
    if (energy != null && energy <= -0.7) {
      score += 1;
      reasons.push("Energy is lower than usual this week");
    }
    if (soreness != null && soreness >= 0.7) {
      score += 1;
      reasons.push("Soreness is higher than usual this week");
    }
  }

  const confidence = sources >= 4 ? "high" : sources >= 2 ? "medium" : "low";
  if (input.inDeload) {
    return {
      level: "deloading",
      score,
      reasons,
      hardWeeks,
      confidence,
      advice: "You're in a deload week. Keep it light and let the fatigue clear.",
    };
  }
  const level: Exclude<FatigueLevel, "deloading"> =
    score >= 4
      ? "deload"
      : score >= 2
        ? "building"
        : score === 0 && sources >= 2
          ? "fresh"
          : "normal";
  const advice = {
    fresh: "You look well recovered. A good time to push for progress.",
    normal: "Nothing points to a build-up of fatigue. Train as planned.",
    building:
      "Some fatigue is building. Keep sessions as planned but skip extra sets, and protect your sleep.",
    deload:
      "Several signs point to accumulated fatigue. A lighter week (about half the sets, a little less weight) would likely help you come back stronger.",
  }[level];
  return { level, score, reasons, advice, confidence, hardWeeks };
}
