"use client";

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { displayWeight, toStoredWeight, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { fieldsFor, type Measurement, type SetSnapshot } from "@/modules/workouts/snapshot";

function NumberCell({
  value,
  placeholder,
  label,
  decimal,
  disabled,
  onChange,
}: {
  value: number | null;
  placeholder?: string;
  label: string;
  decimal?: boolean;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <Input
      aria-label={label}
      type="number"
      inputMode={decimal ? "decimal" : "numeric"}
      step={decimal ? "any" : 1}
      min={0}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="h-11 px-1 text-center text-base font-medium tabular-nums disabled:opacity-100"
    />
  );
}

export function SetRow({
  index,
  workingNumber,
  set,
  previous,
  measurement,
  units,
  onChange,
  onToggle,
  onRemove,
}: {
  index: number;
  workingNumber: number;
  set: SetSnapshot;
  previous?: SetSnapshot;
  measurement: Measurement;
  units: UnitSystem;
  onChange: (patch: Partial<SetSnapshot>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const f = fieldsFor(measurement);
  const done = set.completedAt != null;
  const w = (kg: number | null) => (kg == null ? null : displayWeight(kg, units, 2));
  const distUnit = units === "metric" ? 1000 : 1609.344;

  const prevText = previous
    ? [
        f.weight && previous.weightKg != null ? `${w(previous.weightKg)}` : null,
        f.reps && previous.reps != null ? `${previous.reps}` : null,
        f.duration && previous.durationSeconds != null ? `${previous.durationSeconds}s` : null,
      ]
        .filter(Boolean)
        .join(" × ")
    : "";

  return (
    <div
      className={cn(
        "grid items-center gap-1.5 rounded-lg px-1 py-1",
        f.weight && f.reps
          ? "grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem]"
          : "grid-cols-[2.5rem_1fr_1fr_2.75rem]",
        f.distance && "grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem]",
        done && "bg-accent-soft",
      )}
    >
      <select
        aria-label={`Set ${index + 1} type`}
        value={set.type}
        onChange={(e) =>
          e.target.value === "remove"
            ? onRemove()
            : onChange({ type: e.target.value as SetSnapshot["type"] })
        }
        className={cn(
          "h-11 appearance-none rounded-lg bg-transparent text-center text-sm font-semibold",
          set.type === "warmup" && "text-amber-500",
          (set.type === "drop" || set.type === "failure") && "text-danger",
        )}
      >
        <option value="warmup">W</option>
        <option value="working">{set.type === "working" ? workingNumber : "#"}</option>
        <option value="drop">D</option>
        <option value="failure">F</option>
        <option value="remove">Delete set</option>
      </select>
      <span className="text-muted-foreground truncate text-center text-xs tabular-nums">
        {prevText || "—"}
      </span>
      {f.weight && (
        <NumberCell
          label="Weight"
          decimal
          value={w(set.weightKg)}
          placeholder={previous?.weightKg != null ? String(w(previous.weightKg)) : "0"}
          onChange={(v) => onChange({ weightKg: v == null ? null : toStoredWeight(v, units) })}
        />
      )}
      {f.reps && (
        <NumberCell
          label="Reps"
          value={set.reps}
          placeholder={previous?.reps != null ? String(previous.reps) : "0"}
          onChange={(v) => onChange({ reps: v })}
        />
      )}
      {f.distance && (
        <NumberCell
          label={units === "metric" ? "Distance (km)" : "Distance (mi)"}
          decimal
          value={
            set.distanceMeters == null
              ? null
              : Math.round((set.distanceMeters / distUnit) * 100) / 100
          }
          onChange={(v) => onChange({ distanceMeters: v == null ? null : v * distUnit })}
        />
      )}
      {f.duration && (
        <NumberCell
          label={f.distance ? "Time (min)" : "Time (sec)"}
          decimal={f.distance}
          value={
            set.durationSeconds == null
              ? null
              : f.distance
                ? Math.round((set.durationSeconds / 60) * 10) / 10
                : set.durationSeconds
          }
          onChange={(v) =>
            onChange({ durationSeconds: v == null ? null : Math.round(f.distance ? v * 60 : v) })
          }
        />
      )}
      <button
        type="button"
        aria-label={done ? `Undo set ${index + 1}` : `Complete set ${index + 1}`}
        aria-pressed={done}
        onClick={onToggle}
        className={cn(
          "flex h-11 items-center justify-center rounded-lg transition-colors",
          done ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Check className="size-5" />
      </button>
    </div>
  );
}
