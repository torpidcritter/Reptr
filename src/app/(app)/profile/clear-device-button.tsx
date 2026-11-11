"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { leaveAccount, pendingChanges } from "@/lib/device/session";

/**
 * Makes this browser forget the profile, so a new one can be created here (or another
 * opened with its key). The profile and its training stay saved. Nothing of it is left
 * in the app for the next person on the device. Unsynced changes are never thrown away
 * silently: the person is told, and they stay locked to this profile on this device.
 */
export function ClearDeviceButton({ clearDevice }: { clearDevice: () => Promise<unknown> }) {
  const ask = useConfirm();
  const [pending, setPending] = useState(false);

  const go = async () => {
    const p = pendingChanges();
    const parts = [
      p.workout && "a workout that hasn't finished syncing",
      p.ops && `${p.ops} offline change${p.ops === 1 ? "" : "s"}`,
      p.failed && `${p.failed} change${p.failed === 1 ? "" : "s"} that couldn't be saved`,
    ].filter(Boolean);
    const ok = await ask({
      title: "Remove your profile from this device?",
      body:
        "This browser will forget your profile and you can create a new one here. Your profile and training stay saved: to come back, open it with your profile key. Without the key it can't be opened again." +
        (p.any
          ? ` This device also still has ${parts.join(" and ")}. They'll stay here, encrypted for your profile only, and sync if you open it here again.`
          : ""),
      confirm: "Remove from this device",
      danger: true,
    });
    if (!ok) return;
    setPending(true);
    await leaveAccount(clearDevice, p.any);
  };

  return (
    <Button variant="outline" className="w-full" onClick={go} disabled={pending}>
      <LogOut /> {pending ? "Removing…" : "Remove profile from this device"}
    </Button>
  );
}
