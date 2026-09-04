import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOUR,
  EARLIEST_HOUR,
  getSettings,
  SELECTABLE_HOURS,
  saveSettings,
  validateSettings,
} from "./notification-settings";
import { createTestDb } from "@/lib/test-db";

const VALID = { enabled: true, hour: 21, timeZone: "Asia/Tokyo" };

describe("設定の検証", () => {
  it("形の合わない値を受け付けない", () => {
    expect(validateSettings(null).ok).toBe(false);
    expect(validateSettings({ enabled: "yes", hour: 21, timeZone: "Asia/Tokyo" }).ok).toBe(false);
    expect(validateSettings({ enabled: true, timeZone: "Asia/Tokyo" }).ok).toBe(false);
  });

  it("知らない地域名を受け付けない", () => {
    const result = validateSettings({ ...VALID, timeZone: "Mars/Olympus" });
    expect(result).toEqual({ ok: false, error: "unknown_time_zone" });
  });

  it("夏時間で飛ぶ時間帯を選べない", () => {
    // 春に存在しなくなる時刻（多くの地域で 02:00）を指定できると、
    // その日は一致する起動が無く通知が来ない
    for (const hour of [0, 1, 2, 3, 4, 5]) {
      expect(validateSettings({ ...VALID, hour })).toEqual({
        ok: false,
        error: "hour_out_of_range",
      });
    }
    expect(SELECTABLE_HOURS[0]).toBe(EARLIEST_HOUR);
    expect(SELECTABLE_HOURS).not.toContain(2);
    expect(SELECTABLE_HOURS).toContain(DEFAULT_HOUR);
  });

  it("24時以降を受け付けない", () => {
    expect(validateSettings({ ...VALID, hour: 24 }).ok).toBe(false);
  });
});

describe("設定の保存", () => {
  it("まだ設定していない利用者には既定値を返す。通知は切れている", async () => {
    const db = createTestDb();
    const settings = await getSettings(db, "u1");

    expect(settings.enabled).toBe(false);
    expect(settings.hour).toBe(DEFAULT_HOUR);
  });

  it("保存した設定が残る", async () => {
    const db = createTestDb();
    await saveSettings(db, {
      userId: "u1",
      settings: { enabled: true, hour: 8, timeZone: "Europe/Berlin" },
    });

    const settings = await getSettings(db, "u1");
    expect(settings).toMatchObject({ enabled: true, hour: 8, timeZone: "Europe/Berlin" });
  });

  it("設定を上書きしても行は増えない", async () => {
    const db = createTestDb();
    await saveSettings(db, { userId: "u1", settings: VALID });
    await saveSettings(db, { userId: "u1", settings: { ...VALID, hour: 7 } });

    expect((await getSettings(db, "u1")).hour).toBe(7);
  });

  it("設定を触っても、その日の送信済みの記録を消さない", async () => {
    const db = createTestDb();
    await saveSettings(db, { userId: "u1", settings: VALID });

    // cron が送った状態を作る
    const { notificationSettings } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(notificationSettings)
      .set({ lastSentOn: "2026-08-23" })
      .where(eq(notificationSettings.userId, "u1"));

    // 記録が消えると、設定を触り直すだけで同じ日にもう一度届く
    await saveSettings(db, { userId: "u1", settings: { ...VALID, hour: 7 } });
    expect((await getSettings(db, "u1")).lastSentOn).toBe("2026-08-23");
  });

  it("他の利用者の設定を返さない", async () => {
    const db = createTestDb();
    await saveSettings(db, { userId: "u1", settings: { ...VALID, hour: 7 } });

    expect((await getSettings(db, "u2")).hour).toBe(DEFAULT_HOUR);
    expect((await getSettings(db, "u2")).enabled).toBe(false);
  });
});
