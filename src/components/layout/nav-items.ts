import { Bot, Dumbbell, House, LineChart, User, Ruler } from "lucide-react";

export const navItems = [
  { href: "/", label: "Home", icon: House },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/physique", label: "Body", icon: Ruler },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/** Sub-sections that live under a nav item, e.g. the exercise library under Train. */
const sections: Record<string, string[]> = {
  "/train": ["/exercises", "/routines", "/workout", "/history", "/goals", "/achievements"],
  "/physique": ["/nutrition", "/recovery"],
};

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return [href, ...(sections[href] ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
