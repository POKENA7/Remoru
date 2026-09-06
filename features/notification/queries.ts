import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { getSettings, SELECTABLE_HOURS } from "./notification-settings";

/**
 * 通知の設定の画面に要るもの。
 *
 * design.md D8: 以前は設定を開いたときに `/api/notifications/settings` を
 * 叩いており、開くたびに「読み込み中」が挟まっていた。設定は `/review` の
 * Container が読み、props で配る。
 *
 * **VAPID の公開鍵も一緒に返す。** 購読を作るのに要る。公開鍵なので隠す
 * 必要はなく、ここに載せるのは鍵をビルド時に埋め込まずに済ませるため
 * （本番では `wrangler secret` で入れ替えられる）。
 *
 * **`lastSentOn` は返さない。** 画面では使わない内部の記録である。
 */
export const getNotificationSettings = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  const settings = await getSettings(db, userId);

  return {
    settings: {
      enabled: settings.enabled,
      hour: settings.hour,
      timeZone: settings.timeZone,
    },
    selectableHours: SELECTABLE_HOURS,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  };
});
