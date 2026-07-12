import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../db/schema";
import { getOrCreateUser, updateNotificationSettings, isValidTimezone } from "../../../lib/users";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);
  return NextResponse.json({
    notificationHour: user.notificationHour,
    timezone: user.timezone,
  });
}

export async function PUT(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    notificationHour?: number;
    timezone?: string;
  };
  if (
    typeof body.notificationHour !== "number" ||
    body.notificationHour < 0 ||
    body.notificationHour > 23 ||
    !body.timezone ||
    !isValidTimezone(body.timezone)
  ) {
    return NextResponse.json({ error: "invalid settings" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);
  await updateNotificationSettings(db, user.id, {
    notificationHour: body.notificationHour,
    timezone: body.timezone,
  });
  return NextResponse.json({ ok: true });
}
