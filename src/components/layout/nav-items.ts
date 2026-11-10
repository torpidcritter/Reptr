import { CircleUser, Dumbbell, Flag, House, Trophy, Users } from "lucide-react";

/**
 * The six main destinations. Everything else lives one level under one of them.
 * `short` is what fits under an icon on a phone; it's part of the full label, so
 * screen readers and voice control can use either.
 */
export const navItems = [
  { href: "/", label: "Home", short: "Home", icon: House },
  { href: "/train", label: "Workouts", short: "Workouts", icon: Dumbbell },
  { href: "/social", label: "Social", short: "Social", icon: Users },
  { href: "/leaderboards", label: "Leaderboards", short: "Boards", icon: Trophy },
  { href: "/challenges", label: "Challenges", short: "Challenges", icon: Flag },
  { href: "/profile", label: "Profile", short: "Profile", icon: CircleUser },
] as const;

/** Pages that belong under a main destination, so its tab stays highlighted. */
const sections: Record<string, string[]> = {
  "/": ["/nutrition", "/recovery", "/coach", "/notifications"],
  "/train": [
    "/workout",
    "/routines",
    "/exercises",
    "/history",
    "/progress",
    "/insights",
    "/timeline",
    "/plan",
    "/programs",
    "/goals",
  ],
  "/social": ["/u", "/groups"],
  "/profile": ["/achievements", "/physique", "/admin"],
};

export function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  const prefixes = [...(href === "/" ? [] : [href]), ...(sections[href] ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
