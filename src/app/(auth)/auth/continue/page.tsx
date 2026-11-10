import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

async function ContinueForm({ searchParams }: Pick<PageProps<"/auth/continue">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <form method="post" action="/auth/confirm" className="flex flex-col gap-3">
      <input type="hidden" name="token_hash" value={one(params.token_hash)} />
      <input type="hidden" name="type" value={one(params.type)} />
      <input type="hidden" name="next" value={one(params.next) || "/"} />
      <Button type="submit" size="lg">
        Continue to Reptr
      </Button>
    </form>
  );
}

/**
 * The page a sign-in link opens. The button, not the visit, signs in, so a mail scanner
 * that opens the link first can't use it up.
 */
export default function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Reptr</h1>
      <p className="text-muted-foreground mt-1 mb-6">One tap to finish signing in.</p>
      <Card className="p-5">
        <Suspense fallback={null}>
          <ContinueForm searchParams={searchParams} />
        </Suspense>
      </Card>
    </>
  );
}
