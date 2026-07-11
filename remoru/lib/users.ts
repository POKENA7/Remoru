import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { AppDb } from "../db/types";

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getOrCreateUser(db: AppDb, clerkUserId: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  if (existing[0]) return existing[0];

  const newUser = {
    id: randomUUID(),
    clerkUserId,
    notificationHour: 8,
    timezone: "UTC",
    createdAt: Math.floor(Date.now() / 1000),
  };
  await db.insert(users).values(newUser);
  return newUser;
}

export async function updateNotificationSettings(
  db: AppDb,
  userId: string,
  settings: { notificationHour: number; timezone: string },
) {
  await db
    .update(users)
    .set({
      notificationHour: settings.notificationHour,
      timezone: settings.timezone,
    })
    .where(eq(users.id, userId));
}
