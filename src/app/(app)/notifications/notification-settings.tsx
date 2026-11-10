"use client";

import { useEffect, useState, useTransition } from "react";
import {
  markNotificationsReadAction,
  removePushSubscriptionAction,
  saveNotificationSettingsAction,
  savePushSubscriptionAction,
} from "@/app/(app)/community-actions";
import { Button } from "@/components/ui/button";

type Kind =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "like"
  | "comment"
  | "reply"
  | "challenge_completed"
  | "badge"
  | "level_up"
  | "group_joined";

const kinds: [Kind, string][] = [
  ["follow", "New followers"],
  ["follow_request", "Follow requests"],
  ["follow_accepted", "Accepted requests"],
  ["like", "Likes"],
  ["comment", "Comments on your workouts"],
  ["reply", "Replies to your comments"],
  ["challenge_completed", "Challenges completed"],
  ["badge", "Badges"],
  ["level_up", "Level-ups"],
  ["group_joined", "People joining your groups"],
];

/** Marks everything read once the list has been seen. */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsReadAction();
  }, [unread]);
  return null;
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turns push on for this device: asks permission and registers the subscription. */
async function subscribeThisDevice(publicKey: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("This browser can't receive push notifications.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notifications are blocked for Reptr in this browser.");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const res = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: json.keys });
  if (res.error) throw new Error(res.error);
}

async function unsubscribeThisDevice() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager?.getSubscription();
  if (!sub) return;
  await removePushSubscriptionAction(sub.endpoint);
  await sub.unsubscribe();
}

export function NotificationSettings({
  initial,
  pushKey,
}: {
  initial: { muted: Kind[]; push: boolean };
  /** The server's public push key, or null when push isn't set up. */
  pushKey: string | null;
}) {
  const [muted, setMuted] = useState<Kind[]>(initial.muted);
  const [push, setPush] = useState(initial.push);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMessage(null);
      try {
        if (push && pushKey) await subscribeThisDevice(pushKey);
        if (!push) await unsubscribeThisDevice();
      } catch (e) {
        return setMessage({ error: (e as Error).message });
      }
      const res = await saveNotificationSettingsAction({ muted, push });
      setMessage(res.error ? { error: res.error } : { ok: "Saved." });
    });

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tell me about</legend>
        {kinds.map(([kind, label]) => (
          <label key={kind} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!muted.includes(kind)}
              onChange={(e) =>
                setMuted((m) => (e.target.checked ? m.filter((k) => k !== kind) : [...m, kind]))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      {pushKey ? (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={push}
            onChange={(e) => setPush(e.target.checked)}
            className="mt-1"
          />
          <span>
            Also send them to this device
            <span className="text-muted-foreground block text-xs">
              Push messages say who did what, never your training numbers.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-muted-foreground text-xs">
          Push notifications to your phone aren&apos;t available yet. You&apos;ll see everything
          here.
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-danger text-sm">
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p role="status" className="text-sm">
          {message.ok}
        </p>
      )}
      <Button onClick={save} disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
