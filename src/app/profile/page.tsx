import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardLabel } from "@/components/ui/card";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <>
      <PageHeader title="Profile" subtitle="Preferences and account" />
      <Card className="max-w-md">
        <CardLabel>Appearance</CardLabel>
        <ThemeToggle className="mt-3" />
      </Card>
    </>
  );
}
