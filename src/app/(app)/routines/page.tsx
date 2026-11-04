import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RoutineList } from "./routine-list";

export const metadata: Metadata = { title: "Routines" };

export default function RoutinesPage() {
  return (
    <>
      <PageHeader
        title="Routines"
        subtitle="Saved plans you can start in one tap"
        action={
          <Link href="/routines/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading routines…</p>}>
        <RoutineList />
      </Suspense>
    </>
  );
}
