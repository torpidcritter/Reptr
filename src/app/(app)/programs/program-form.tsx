"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startProgramAction } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

const field = "bg-background h-11 w-full rounded-lg border px-3 text-base";

export function ProgramForm({ monday, replacing }: { monday: string; replacing: boolean }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(monday);
  const [weeks, setWeeks] = useState("8");
  const [deloadEvery, setDeloadEvery] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ask = useConfirm();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      replacing &&
      !(await ask({
        title: "Start a new block?",
        body: "This ends your current block.",
        confirm: "Start new block",
      }))
    )
      return;
    start(async () => {
      const res = await startProgramAction({ name, startDate, weeks, deloadEvery });
      if (res.error) return setError(res.error);
      setError(null);
      setName("");
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Name</span>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Winter strength block"
          maxLength={80}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Weeks</span>
          <select value={weeks} onChange={(e) => setWeeks(e.target.value)} className={field}>
            {Array.from({ length: 15 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} weeks
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Deload</span>
          <select
            value={deloadEvery}
            onChange={(e) => setDeloadEvery(e.target.value)}
            className={field}
          >
            <option value="">None</option>
            {[3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                Every {n} weeks
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Starting the week of</span>
        <Input
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start block"}
      </Button>
    </form>
  );
}
