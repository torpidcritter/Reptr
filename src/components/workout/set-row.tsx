"use client";

import { Check } from "lucide-react";
import { useState } from "react";
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
  const hasDetail = set.rpe != null || set.rir != null || set.tempo != null || !!set.note;
  const [detailOpen, setDetailOpen] = useState(false);
  const showDetail = detailOpen || hasDetail;
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
    <div className={cn("rounded-lg", done && "bg-accent-soft")}>
      <div
        className={cn(
          "grid items-center gap-1.5 rounded-lg px-1 py-1",
          f.weight && f.reps
            ? "grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem]"
            : "grid-cols-[2.5rem_1fr_1fr_2.75rem]",
          f.distance && "grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem]",
        )}
      >
        <select
          aria-label={`Set ${index + 1} type`}
          value={set.type}
          onChange={(e) =>
            e.target.value === "remove"
              ? onRemove()
              : e.target.value === "detail"
                ? setDetailOpen((o) => !o)
                : onChange({ type: e.target.value as SetSnapshot["type"] })
          }
          className={cn(
            "h-11 appearance-none rounded-lg bg-transparent text-center text-sm font-semibold",
            set.type === "warmup" && "text-amber-500",
            (set.type === "drop" || set.type === "failure" || set.type === "rest_pause") &&
              "text-danger",
          )}
        >
          <option value="warmup">W</option>
          <option value="working">{set.type === "working" ? workingNumber : "#"}</option>
          <option value="drop">D</option>
          <option value="failure">F</option>
          <option value="rest_pause">RP</option>
          <option value="detail">
            {showDetail ? "Hide RPE, RIR, tempo" : "RPE, RIR, tempo, note"}
          </option>
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
      {showDetail && <SetDetail set={set} index={index} onChange={onChange} />}
    </div>
  );
}

const detailInput =
  "bg-background text-foreground h-9 w-full rounded-md border px-2 text-center text-sm tabular-nums";

/** The optional extras for a set: effort (RPE or RIR), tempo and a short note. */
function SetDetail({
  set,
  index,
  onChange,
}: {
  set: SetSnapshot;
  index: number;
  onChange: (patch: Partial<SetSnapshot>) => void;
}) {
  const [tempo, setTempo] = useState(set.tempo ?? "");
  const tempoValid = tempo === "" || /^[0-9X]{4}$/.test(tempo);
  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-1.5 px-1 pb-2 text-xs">
      <span />
      <label className="text-muted-foreground flex flex-col gap-0.5">
        RPE
        <select
          aria-label={`Set ${index + 1} RPE`}
          value={set.rpe ?? ""}
          onChange={(e) => onChange({ rpe: e.target.value === "" ? null : Number(e.target.value) })}
          className={detailInput}
        >
          <option value="">–</option>
          {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-muted-foreground flex flex-col gap-0.5">
        RIR
        <select
          aria-label={`Set ${index + 1} reps in reserve`}
          value={set.rir ?? ""}
          onChange={(e) => onChange({ rir: e.target.value === "" ? null : Number(e.target.value) })}
          className={detailInput}
        >
          <option value="">–</option>
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-muted-foreground flex flex-col gap-0.5">
        Tempo
        <input
          aria-label={`Set ${index + 1} tempo`}
          aria-invalid={!tempoValid}
          value={tempo}
          maxLength={4}
          placeholder="3010"
          onChange={(e) => {
            const v = e.target.value.toUpperCase().replace(/[^0-9X]/g, "");
            setTempo(v);
            if (v === "") onChange({ tempo: null });
            else if (/^[0-9X]{4}$/.test(v)) onChange({ tempo: v });
          }}
          className={cn(detailInput, !tempoValid && "border-danger")}
        />
      </label>
      <span />
      <input
        aria-label={`Set ${index + 1} note`}
        value={set.note ?? ""}
        maxLength={200}
        placeholder="Note (grip, cue, how it felt)"
        onChange={(e) => onChange({ note: e.target.value === "" ? null : e.target.value })}
        className={cn(detailInput, "col-span-3 text-left")}
      />
    </div>
  );
}
