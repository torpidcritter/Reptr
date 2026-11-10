import Link from "next/link";
import type { ReactNode } from "react";
import type { ProfileCard } from "@/modules/social/social";
import { Avatar, PersonName } from "./avatar";

/** One person in a list: picture and name linking to their profile, and an action. */
export function PersonRow({
  card,
  url,
  children,
}: {
  card: ProfileCard;
  url?: string | null;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <Link href={`/u/${card.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={card.displayName} handle={card.handle} url={url} />
        <PersonName name={card.displayName} handle={card.handle} />
      </Link>
      {children}
    </li>
  );
}
