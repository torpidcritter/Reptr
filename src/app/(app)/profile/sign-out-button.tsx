"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { leaveAccount, pendingChanges } from "@/lib/device/session";

/**
 * Signs out and leaves nothing of this account in the app for the next person on the
 * device. Unsynced changes are never thrown away silently: the person is told, and they
 * stay locked to this account on this device until it signs in here again.
 */
export function SignOutButton({ signOut }: { signOut: () => Promise<unknown> }) {
  const ask = useConfirm();
  const [pending, setPending] = useState(false);

  const go = async () => {
    const p = pendingChanges();
    let keep = false;
    if (p.any) {
      const parts = [
        p.workout && "a workout that hasn't finished syncing",
        p.ops && `${p.ops} offline change${p.ops === 1 ? "" : "s"}`,
        p.failed && `${p.failed} change${p.failed === 1 ? "" : "s"} that couldn't be saved`,
      ].filter(Boolean);
      const ok = await ask({
        title: "Some changes haven't synced",
        body: `This device still has ${parts.join(" and ")}. They'll stay on this device, readable only by your account, and sync the next time you sign in here. If you sign in somewhere else instead, they won't be there.`,
        confirm: "Sign out anyway",
      });
      if (!ok) return;
      keep = true;
    }
    setPending(true);
    await leaveAccount(signOut, keep);
  };

  return (
    <Button variant="outline" className="w-full" onClick={go} disabled={pending}>
      <LogOut /> {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
