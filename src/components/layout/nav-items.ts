import { Bot, CalendarDays, Dumbbell, House, TrendingUp } from "lucide-react";

/** The five main destinations. Everything else lives one level under one of them. */
export const navItems = [
  { href: "/", label: "Today", icon: House },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: Bot },
] as const;

/** Pages that belong under a main destination, so its tab stays highlighted. */
const sections: Record<string, string[]> = {
  "/": ["/nutrition", "/recovery"],
  "/train": ["/workout", "/routines", "/exercises"],
  "/progress": ["/history", "/insights", "/physique", "/achievements", "/timeline"],
  "/plan": ["/programs", "/goals"],
};

export function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  const prefixes = [...(href === "/" ? [] : [href]), ...(sections[href] ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
