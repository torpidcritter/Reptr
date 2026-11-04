"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/input";

type Option = { slug: string; name: string };

export function ExerciseFilters({
  muscles,
  equipment,
}: {
  muscles: Option[];
  equipment: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    // Read the live URL, not the render-time params, so quick changes don't undo each other.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 grid gap-2 md:grid-cols-[1fr_200px_200px]">
      <label className="relative">
        <span className="sr-only">Search exercises</span>
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises"
          className="pl-9"
        />
      </label>
      <Select
        aria-label="Muscle"
        value={params.get("muscle") ?? ""}
        onChange={(e) => update("muscle", e.target.value)}
      >
        <option value="">All muscles</option>
        {muscles.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Equipment"
        value={params.get("equipment") ?? ""}
        onChange={(e) => update("equipment", e.target.value)}
      >
        <option value="">All equipment</option>
        {equipment.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
