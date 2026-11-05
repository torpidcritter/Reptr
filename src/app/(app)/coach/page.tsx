import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { listMemories } from "@/modules/coach/memory";
import { CoachChatLoader } from "./chat-loader";
import { MemoryPanel } from "./memory-panel";

export const metadata: Metadata = { title: "Coach" };

async function Memories() {
  const user = await requireUser();
  return <MemoryPanel memories={await listMemories(db, user.id)} />;
}

async function Chat() {
  await connection(); // whether the key is set is a runtime fact, not a build-time one
  return <CoachChatLoader enabled={Boolean(process.env.OPENAI_API_KEY)} />;
}

export default function CoachPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Coach"
        subtitle="Answers from your own data. Changes only happen when you confirm."
      />
      <Suspense fallback={null}>
        <Memories />
      </Suspense>
      <Suspense fallback={null}>
        <Chat />
      </Suspense>
    </div>
  );
}
