import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "New group" };

export default function NewGroupPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/groups"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Groups
      </Link>
      <PageHeader title="New group" />
      <Card>
        <GroupForm />
      </Card>
    </div>
  );
}
