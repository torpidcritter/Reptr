import { Bot, Dumbbell, House, LineChart, User, Ruler } from "lucide-react";

export const navItems = [
  { href: "/", label: "Home", icon: House },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/physique", label: "Physique", icon: Ruler },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
