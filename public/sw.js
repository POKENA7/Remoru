/*
 * 通知の受信とタップを扱う Service Worker。
 *
 * 本文は cron worker が lib/notification-message.ts で組み立てたもの
 * （{ title, body, url }）。ここでは中身を作らない。
 */

const FALLBACK_URL = "/review";

self.addEventListener("install", () => {
  // 古い版を待たずに入れ替える。表示を担っていないので安全。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 形が違うものは既定の文言で出す。黙って消すと届かない理由が分からない。
  }

  const title = payload.title || "復習の時間です";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 同じ日に複数出さない。後から届いたもので置き換える。
    tag: "remoru-review",
    renotify: false,
    data: { url: payload.url || FALLBACK_URL },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || FALLBACK_URL;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // すでに開いているものがあれば、開き直さずそれを復習へ切り替える
      // （spec「すでにアプリが開いているとき」）。
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        client.postMessage({ type: "remoru:open-review" });
        return;
      }

      await self.clients.openWindow(url);
    })(),
  );
});
