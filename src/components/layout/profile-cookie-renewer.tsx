"use client";

import { useEffect } from "react";

const KEY = "reptr-profile-renewed";
const DAY = 24 * 3600 * 1000;

/** Keeps this browser's profile cookie from expiring: renews it at most once a day. */
export function ProfileCookieRenewer() {
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY)) || 0;
    } catch {}
    if (Date.now() - last < DAY) return;
    fetch("/api/profile/renew", { method: "POST", credentials: "same-origin" })
      .then((r) => {
        if (r.ok) localStorage.setItem(KEY, String(Date.now()));
      })
      .catch(() => {});
  }, []);
  return null;
}
