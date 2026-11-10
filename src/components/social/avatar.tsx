import { cn } from "@/lib/utils";

/** A profile picture, or the person's initials when there isn't one. */
export function Avatar({
  name,
  handle,
  url,
  size = "md",
}: {
  name: string | null;
  handle: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-20 text-2xl" }[size];
  const initials = (name || handle)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
    return <img src={url} alt="" className={cn(box, "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        "bg-accent-soft text-accent flex shrink-0 items-center justify-center rounded-full font-semibold",
      )}
    >
      {initials}
    </span>
  );
}

/** "Ana Lima @ana" with the name falling back to the handle. */
export function PersonName({ name, handle }: { name: string | null; handle: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{name || `@${handle}`}</span>
      {name && <span className="text-muted-foreground block truncate text-xs">@{handle}</span>}
    </span>
  );
}
