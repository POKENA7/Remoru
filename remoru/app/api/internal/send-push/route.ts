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

  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, keysP256dh: sub.keysP256dh, keysAuth: sub.keysAuth },
        {
          title: "Remoru",
          body: `今日${body.dueCount}件の復習があります`,
          url: "/review",
        },
        vapid,
      );
      if (result.ok) {
        sent += 1;
      } else {
        expired += 1;
        await removePushSubscriptionByEndpoint(db, sub.endpoint);
      }
    } catch {
      // An unexpected error for one subscription (e.g. transient network/5xx
      // from the push service) must not prevent delivery to the user's
      // other devices, nor abort the whole request.
      failed += 1;
    }
  }

  return NextResponse.json({ sent, expired, failed, total: subs.length });
}
