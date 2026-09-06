"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { saveSettings, validateSettings } from "./notification-settings";
import {
  deleteSubscription,
  saveSubscription,
  validateSubscription,
} from "./notification-subscriptions";
import type { SaveSettingsResult, SubscriptionResult } from "./types";

/**
 * 通知の書き込みの入口。形は `features/memo/actions.ts` と同じ
 * （design.md D1・D4・D6）。
 */

/**
 * 通知の設定を保存する。
 *
 * 引数は型が付いているが、**中身は要求由来なので検証は通す。** Server Action は
 * 公開された宛先で、画面を経由しない呼び出しが届きうる（design.md D6）。
 * 時刻の範囲と地域名の妥当性は `validateSettings` が持つ。
 */
export async function saveNotificationSettings(settings: {
  enabled: boolean;
  hour: number;
  timeZone: string;
}): Promise<SaveSettingsResult> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const validated = validateSettings(settings);
    if (!validated.ok) return { ok: false, reason: validated.error };

    const db = await getDb();
    const saved = await saveSettings(db, { userId, settings: validated.settings });

    refresh();
    return {
      ok: true,
      settings: { enabled: saved.enabled, hour: saved.hour, timeZone: saved.timeZone },
    };
  } catch (error) {
    console.error("通知の設定を保存できなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * 端末の購読を保存する。
 *
 * 利用者はセッションから導く。引数から受け取らない（change 3 D2）。
 */
export async function registerSubscription(subscription: {
  endpoint: string;
  p256dh: string | undefined;
  auth: string | undefined;
}): Promise<SubscriptionResult> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const validated = validateSubscription(subscription);
    if (!validated) return { ok: false, reason: "malformed" };

    const db = await getDb();
    await saveSubscription(db, { userId, subscription: validated, now: Date.now() });

    // 購読の有無は画面に出ないので描き直しは要らない。設定の保存が別にある
    return { ok: true };
  } catch (error) {
    console.error("購読を保存できなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/** 端末の購読を取り消す。自分のものでなければ何も消さない。 */
export async function unregisterSubscription(endpoint: string): Promise<SubscriptionResult> {
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    if (endpoint.length === 0) return { ok: false, reason: "malformed" };

    const db = await getDb();
    await deleteSubscription(db, { userId, endpoint });

    return { ok: true };
  } catch (error) {
    console.error("購読を取り消せなかった", error);
    return { ok: false, reason: "failed" };
  }
}
