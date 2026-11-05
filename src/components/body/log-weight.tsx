"use client";

import { Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { saveWeightAction } from "@/app/(app)/physique/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { displayWeight, lbToKg, type UnitSystem, weightUnitLabel } from "@/lib/units";
import type { WeighIn } from "@/modules/body/body";

const pad = (n: number) => String(n).padStart(2, "0");
const now = () => {
  const d = new Date();
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

/** The form inside the Log weight sheet: weight, date and time, and an optional note. */
function WeightForm({
  units,
  entry,
  onDone,
}: {
  units: UnitSystem;
  entry?: WeighIn;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [initial] = useState(() =>
    entry
      ? { day: entry.day, time: entry.time ?? "12:00", note: entry.note }
      : { ...now(), note: "" },
  );

  function submit(form: FormData) {
    setError(null);
    const raw = Number(String(form.get("weight")).replace(",", "."));
    if (!raw) return setError("Enter your weight.");
    const payload = {
      weightKg: units === "imperial" ? lbToKg(raw) : raw,
      day: String(form.get("day")),
      time: String(form.get("time") || "12:00"),
      note: String(form.get("note") ?? ""),
    };
    start(async () => {
      const res = await saveWeightAction(payload, entry?.id);
      if (res.error) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Weight ({weightUnitLabel(units)})</span>
        <Input
          name="weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          autoFocus
          required
          defaultValue={entry ? displayWeight(entry.weightKg, units, 1) : undefined}
          className="h-14 text-2xl font-semibold tabular-nums"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Date</span>
          <Input name="day" type="date" required defaultValue={initial.day} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Time</span>
          <Input name="time" type="time" defaultValue={initial.time} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Note (optional)</span>
        <Input
          name="note"
          maxLength={200}
          defaultValue={initial.note}
          placeholder="e.g. after a cheat day"
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : entry ? "Save changes" : "Save weight"}
      </Button>
    </form>
  );
}

/** Opens the weight sheet. Pass `entry` to edit an existing weigh-in. */
export function LogWeightButton({
  units,
  entry,
  children,
  className,
  variant = "outline",
}: {
  units: UnitSystem;
  entry?: WeighIn;
  children?: ReactNode;
  className?: string;
  variant?: "primary" | "outline" | "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Scale /> Log weight
          </>
        )}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={entry ? "Edit weigh-in" : "Log weight"}
      >
        {/* Remount each time it opens, so the date and time start fresh. */}
        {open && <WeightForm units={units} entry={entry} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}
