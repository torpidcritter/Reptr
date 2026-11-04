import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function LinkError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="bg-muted text-danger mb-4 rounded-xl p-3 text-sm">
      That sign-in link has expired or was already used. Request a new one.
    </p>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Reptr</h1>
      <p className="text-muted-foreground mt-1 mb-6">Sign in to start logging your training.</p>
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <Card className="p-5">
        <LoginForm />
      </Card>
    </>
  );
}
