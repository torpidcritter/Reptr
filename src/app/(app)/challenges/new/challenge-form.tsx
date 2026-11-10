"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createChallengeAction } from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toStoredWeight, weightUnitLabel, type UnitSystem } from "@/lib/units";
import {
  challengeKinds,
  metrics,
  type ChallengeVisibility,
  type Metric,
} from "@/modules/community/challenge-options";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function ChallengeForm({
  groups,
  groupId,
  units,
}: {
  groups: { id: string; name: string }[];
  groupId?: string;
  units: UnitSystem;
}) {
  const router = useRouter();
  const today = new Date();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<Metric>("workouts");
  const [target, setTarget] = useState("");
  const [visibility, setVisibility] = useState<ChallengeVisibility>(
    groupId && groups.some((g) => g.id === groupId) ? "group" : "followers",
  );
  const [group, setGroup] = useState(groupId ?? groups[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(isoDay(today));
  const [endsOn, setEndsOn] = useState(isoDay(new Date(today.getTime() + 13 * 86400_000)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unit = metric === "volume" ? weightUnitLabel(units) : metrics[metric].unit;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const n = target.trim() === "" ? null : Number(target);
      if (n !== null && !(n > 0)) return setError("The target needs to be a number above 0.");
      const res = await createChallengeAction({
        title,
        description,
        metric,
        target: n === null ? null : metric === "volume" ? toStoredWeight(n, units) : n,
        visibility,
        groupId: visibility === "group" ? group || null : null,
        startsOn,
        endsOn,
      });
      if (res.error) return setError(res.error);
      router.push(`/challenges/${res.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={60}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description (optional)
        </label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="metric" className="text-sm font-medium">
            What counts
          </label>
          <Select id="metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {Object.entries(metrics).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="target" className="text-sm font-medium">
            Target in {unit} (optional)
          </label>
          <Input
            id="target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="visibility" className="text-sm font-medium">
          Who can join
        </label>
        <Select
          id="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as ChallengeVisibility)}
        >
          {Object.entries(challengeKinds)
            .filter(([key]) => key !== "group" || groups.length > 0)
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </Select>
      </div>
      {visibility === "group" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="group" className="text-sm font-medium">
            Group
          </label>
          <Select id="group" value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startsOn" className="text-sm font-medium">
            Starts
          </label>
          <Input
            id="startsOn"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endsOn" className="text-sm font-medium">
            Ends
          </label>
          <Input
            id="endsOn"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Days run midnight to midnight UTC, up to 3 months. Only workouts saved to your account
        count, scored the same way as the leaderboards.
      </p>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create challenge"}
      </Button>
    </form>
  );
}
