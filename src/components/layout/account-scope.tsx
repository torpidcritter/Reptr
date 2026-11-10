"use client";

import { useEffect } from "react";
import { protectStorage, switchAccount } from "@/lib/device/scope";

/**
 * Tells the device stores which account is signed in, so they load and save that
 * account's data only, encrypted with its device key. Rendered once in the app layout.
 */
export function AccountScope({ userId, deviceKey }: { userId: string; deviceKey: string }) {
  useEffect(() => {
    switchAccount(userId, deviceKey).catch(() => {});
    protectStorage();
  }, [userId, deviceKey]);
  return null;
}
