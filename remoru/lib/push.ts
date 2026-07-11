import webPush from "web-push";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
}

export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: { title: string; body: string; url: string },
  vapid: VapidKeys,
): Promise<{ ok: true } | { ok: false; expired: true }> {
  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keysP256dh, auth: subscription.keysAuth },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      return { ok: false, expired: true };
    }
    throw err;
  }
}
