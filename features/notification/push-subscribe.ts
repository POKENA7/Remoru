/**
 * 端末の許可を得て購読を保存する。
 *
 * **画面から切り離してある。** 通知の設定と、初回の告知（first-run）の
 * 2箇所から同じ処理を呼ぶ。同じ手順を2箇所に書くと、片方だけ直したときに
 * 静かにずれる。
 */

export type SubscribeOutcome =
  | { ok: true }
  | { ok: false; reason: "blocked" | "declined" | "failed" };

/** VAPID の公開鍵は base64url。applicationServerKey は生のバイト列を要る。 */
function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // Uint8Array.from では ArrayBufferLike になり applicationServerKey に渡せない
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** この端末が通知を扱えるか。 */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeOutcome> {
  // 断った人に繰り返し求めない（spec の要件）。denied のときは求め直さない。
  if (Notification.permission === "denied") return { ok: false, reason: "blocked" };

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "declined" };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  const res = await fetch("/api/notifications/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }),
  });
  return res.ok ? { ok: true } : { ok: false, reason: "failed" };
}
