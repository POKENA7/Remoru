import { eq } from "drizzle-orm";
import { notificationSettings, type NotificationSettings } from "../db/schema";
import type { AppDb } from "../db/types";
import { localHourAndDate } from "./notification-timing";

export const DEFAULT_HOUR = 21;
export const DEFAULT_TIME_ZONE = "Asia/Tokyo";

/**
 * 選べる時刻は 6〜23 時。
 *
 * 夏時間を始める日、その地域では存在しない時刻が生じる（多くの地域で
 * 02:00 が 03:00 に飛ぶ）。存在しない時刻を指定していると、その日は
 * 一致する起動が無く通知が来ない。飛ぶ時刻は世界のどの地域でも
 * 00:00〜04:00 の範囲にあるため、そこを選べないようにして避ける。
 *
 * 記憶の定着を助けるアプリとして、深夜に呼び戻さないという判断とも
 * 向きが同じ。
 */
export const EARLIEST_HOUR = 6;
export const LATEST_HOUR = 23;

export const SELECTABLE_HOURS: number[] = Array.from(
  { length: LATEST_HOUR - EARLIEST_HOUR + 1 },
  (_, i) => EARLIEST_HOUR + i,
);

export type SettingsInput = {
  enabled: boolean;
  hour: number;
  timeZone: string;
};

export type ValidationError = "hour_out_of_range" | "unknown_time_zone" | "malformed";

export type ValidatedSettings =
  | { ok: true; settings: SettingsInput }
  | { ok: false; error: ValidationError };

export function validateSettings(raw: unknown): ValidatedSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "malformed" };
  }
  const { enabled, hour, timeZone } = raw as Record<string, unknown>;

  if (typeof enabled !== "boolean" || typeof hour !== "number" || typeof timeZone !== "string") {
    return { ok: false, error: "malformed" };
  }
  if (!SELECTABLE_HOURS.includes(hour)) {
    return { ok: false, error: "hour_out_of_range" };
  }
  // 不正な地域名を保存すると、その利用者へは以後ずっと届かない。
  // cron は壊れた設定を飛ばして進むので、失敗は静かに起きる。
  if (localHourAndDate(Date.now(), timeZone) === null) {
    return { ok: false, error: "unknown_time_zone" };
  }

  return { ok: true, settings: { enabled, hour, timeZone } };
}

/** まだ設定していない利用者の既定値。保存はしない。 */
export function defaultSettings(userId: string): NotificationSettings {
  return {
    userId,
    enabled: false,
    hour: DEFAULT_HOUR,
    timeZone: DEFAULT_TIME_ZONE,
    lastSentOn: null,
  };
}

export async function getSettings(
  db: AppDb,
  userId: string,
): Promise<NotificationSettings> {
  const rows = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));

  return rows[0] ?? defaultSettings(userId);
}

/**
 * 設定を保存する。
 *
 * `lastSentOn` には触れない。ここで消すと、設定を触り直すたびに同じ日の
 * 通知が再び送られる。
 */
export async function saveSettings(
  db: AppDb,
  params: { userId: string; settings: SettingsInput },
): Promise<NotificationSettings> {
  const { userId, settings } = params;

  await db
    .insert(notificationSettings)
    .values({ userId, ...settings })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: settings,
    });

  return await getSettings(db, userId);
}
