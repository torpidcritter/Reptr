"use client";

import { useEffect } from "react";
import { protectStorage, switchAccount } from "@/lib/device/scope";

/**
 * Tells the device stores which account is signed in, so they load and save that
 * account's data only. Rendered once in the app layout.
 */
export function AccountScope({ userId }: { userId: string }) {
  useEffect(() => {
    switchAccount(userId).catch(() => {});
    protectStorage();
  }, [userId]);
  return null;
}
