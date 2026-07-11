import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../../../db/schema";
import { sendWebPush } from "../../../../lib/push";
import { removePushSubscriptionByEndpoint } from "../../../../lib/notifications";

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const secret = req.headers.get("x-internal-secret");
  if (secret !== env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { userId: string; dueCount: number };
  const db = drizzle(env.DB, { schema });
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, body.userId));

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };

  for (const sub of subs) {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, keysP256dh: sub.keysP256dh, keysAuth: sub.keysAuth },
      {
        title: "Remoru",
        body: `今日${body.dueCount}件の復習があります`,
        url: "/review",
      },
      vapid,
    );
    if (!result.ok) {
      await removePushSubscriptionByEndpoint(db, sub.endpoint);
    }
  }

  return NextResponse.json({ sent: subs.length });
}
