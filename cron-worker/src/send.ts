import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { SendOutcome, Subscription } from "../../features/notification/push";
import { classifyResponse } from "../../features/notification/push";
import type { Env } from "./index";

/**
 * 1件のプッシュを送る。
 *
 * `web-push` は Node.js 向けで Workers では動かない。Web Crypto を使う
 * 実装を用いる（design.md D2）。
 */
export async function sendOne(
  env: Env,
  subscription: Subscription,
  payload: string,
): Promise<SendOutcome> {
  const request = await buildPushPayload(
    { data: payload, options: { ttl: 12 * 60 * 60 } },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );

  const response = await fetch(subscription.endpoint, request);
  return classifyResponse(response.status);
}
