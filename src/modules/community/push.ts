import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { pushSubscriptions } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { log } from "@/lib/log";

// Web Push. Turned on by setting NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT (a mailto: or https: contact). Without them, notifications stay in the
// app and the push switch isn't offered. Generate keys with `npx web-push generate-vapid-keys`.

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

let ready = false;
function setUp() {
  if (ready) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
  return true;
}

export const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "Push needs a secure endpoint."),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

const MAX_DEVICES = 10;

export async function savePushSubscription(
  db: Database,
  me: string,
  input: z.input<typeof subscriptionSchema>,
) {
  const s = subscriptionSchema.parse(input);
  await withUser(db, me, async (tx) => {
    // An endpoint belongs to one browser; if another account used it, that's replaced
    // on the owner connection below (RLS can't see the other account's row).
    const mine = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, me));
    if (mine.length >= MAX_DEVICES) {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, mine[0].id));
    }
  });
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
  await withUser(db, me, (tx) =>
    tx.insert(pushSubscriptions).values({
      userId: me,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
    }),
  );
}

export async function removePushSubscription(db: Database, me: string, endpoint: string) {
  await withUser(db, me, (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, me), eq(pushSubscriptions.endpoint, endpoint))),
  );
}

/** Sends one message to each of the person's devices; forgets devices that are gone. */
export async function sendPush(
  db: Database,
  userId: string,
  message: { text: string; href: string },
) {
  if (!setUp()) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  const payload = JSON.stringify({ title: "Reptr", body: message.text, url: message.href });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 3600, timeout: 5000 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          log.warn("push_failed", { err, status });
        }
      }
    }),
  );
}
