import { randomUUID } from "node:crypto";
import { eq, and, lte } from "drizzle-orm";
import { pushSubscriptions, reviewCards, users } from "../db/schema";
import type { AppDb } from "../db/types";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function upsertPushSubscription(
  db: AppDb,
  userId: string,
  sub: PushSubscriptionInput,
) {
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, sub.endpoint));

  if (existing[0]) {
    await db
      .update(pushSubscriptions)
      .set({
        userId,
        keysP256dh: sub.keys.p256dh,
        keysAuth: sub.keys.auth,
      })
      .where(eq(pushSubscriptions.endpoint, sub.endpoint));
    return existing[0].id;
  }

  const id = randomUUID();
  await db.insert(pushSubscriptions).values({
    id,
    userId,
    endpoint: sub.endpoint,
    keysP256dh: sub.keys.p256dh,
    keysAuth: sub.keys.auth,
  });
  return id;
}

export async function removePushSubscriptionByEndpoint(
  db: AppDb,
  endpoint: string,
) {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export interface DueUserSummary {
  userId: string;
  dueCount: number;
}

export async function getUsersDueForNotification(
  db: AppDb,
  nowTs: number,
): Promise<DueUserSummary[]> {
  const allUsers = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      notificationHour: users.notificationHour,
    })
    .from(users);

  const dueUsers: DueUserSummary[] = [];
  for (const u of allUsers) {
    let localHour: number;
    try {
      localHour = getLocalHour(nowTs, u.timezone);
    } catch {
      // An invalid/unrecognized IANA timezone string must not abort the
      // whole notification scan for every other user — skip just this one.
      continue;
    }
    if (localHour !== u.notificationHour) continue;

    const dueCards = await db
      .select({ id: reviewCards.id })
      .from(reviewCards)
      .where(and(eq(reviewCards.userId, u.id), lte(reviewCards.dueDate, nowTs)));

    if (dueCards.length > 0) {
      dueUsers.push({ userId: u.id, dueCount: dueCards.length });
    }
  }
  return dueUsers;
}

export function getLocalHour(nowTs: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  return parseInt(formatter.format(new Date(nowTs * 1000)), 10) % 24;
}
