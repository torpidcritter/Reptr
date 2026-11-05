import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RoutineBuilder } from "../routine-builder";

export const metadata: Metadata = { title: "New routine" };

export default function NewRoutinePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="New routine" subtitle="A reusable plan for a training day" />
      <RoutineBuilder initial={{ id: null, name: "", notes: null, scheduleDays: [], items: [] }} />
    </div>
  );
}
