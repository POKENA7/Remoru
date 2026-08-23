import { and, eq } from "drizzle-orm";
import { pushSubscriptions, type PushSubscription } from "../db/schema";
import type { AppDb } from "../db/types";

/** ブラウザの PushSubscription から取り出す、送信に要る3つ組。 */
export type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function validateSubscription(raw: unknown): SubscriptionInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { endpoint, p256dh, auth } = raw as Record<string, unknown>;
  if (typeof endpoint !== "string" || endpoint.length === 0) return null;
  if (typeof p256dh !== "string" || p256dh.length === 0) return null;
  if (typeof auth !== "string" || auth.length === 0) return null;
  return { endpoint, p256dh, auth };
}

/**
 * 購読を1件保存する。同じ送信先を二重に持たない。
 *
 * 送信先（endpoint）は「そのブラウザ」を指すもので、利用者ではない。
 * 同じブラウザで別の利用者がサインインすると同じ送信先が再び送られて
 * くるため、衝突時は**持ち主を新しい利用者へ移す**。行を増やすと、
 * 一方の端末に二人ぶんの通知が届く。
 */
export async function saveSubscription(
  db: AppDb,
  params: { userId: string; subscription: SubscriptionInput; now: number },
): Promise<void> {
  const { userId, subscription, now } = params;

  await db
    .insert(pushSubscriptions)
    .values({
      id: crypto.randomUUID(),
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });
}

/** その利用者の購読だけを返す。 */
export async function listSubscriptions(
  db: AppDb,
  userId: string,
): Promise<PushSubscription[]> {
  return await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * 送信先を指定して購読を1件消す。持ち主でなければ何も消さない。
 *
 * 利用者の識別子は常にセッション由来（change 3 D2）。要求から受け取った
 * 送信先だけで消せる作りにすると、他人の購読を消せてしまう。
 */
export async function deleteSubscription(
  db: AppDb,
  params: { userId: string; endpoint: string },
): Promise<boolean> {
  const deleted = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, params.userId),
        eq(pushSubscriptions.endpoint, params.endpoint),
      ),
    )
    .returning({ id: pushSubscriptions.id });

  return deleted.length > 0;
}
