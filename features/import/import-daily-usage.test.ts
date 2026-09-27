import { describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { DAILY_IMPORT_LIMIT, DAY_MS, takeDailyUsage, utcDay } from "./import-daily-usage";

/** テスト用の利用者。 */
const USER = "user_a";
const OTHER = "user_b";

/** 2026-09-27 の UTC の始まり・終わりと、翌日の始まり。 */
const DAY_START = Date.parse("2026-09-27T00:00:00.000Z");
const DAY_END = Date.parse("2026-09-27T23:59:59.999Z");
const NEXT_DAY_START = Date.parse("2026-09-28T00:00:00.000Z");

describe("utcDay", () => {
  // L07: 日の境目は、利用者の地域と無関係に UTC で決まる
  it("同じ瞬間を別の地域の時刻表現で与えても、同じ日になる", () => {
    // Pacific/Auckland（+13:00）。DAY_END と同じ絶対時刻
    expect(utcDay(Date.parse("2026-09-28T12:59:59.999+13:00"))).toBe(utcDay(DAY_END));
    // America/Los_Angeles（-07:00）。DAY_END と同じ絶対時刻
    expect(utcDay(Date.parse("2026-09-27T16:59:59.999-07:00"))).toBe(utcDay(DAY_END));

    // 翌日の始まりも、同じ瞬間を別の表現で与える
    expect(utcDay(Date.parse("2026-09-28T13:00:00.000+13:00"))).toBe(utcDay(NEXT_DAY_START));
    expect(utcDay(Date.parse("2026-09-27T17:00:00.000-07:00"))).toBe(utcDay(NEXT_DAY_START));
  });

  it("UTC の 23:59:59.999 と翌日の 00:00:00.000 は別の日", () => {
    expect(utcDay(DAY_END)).not.toBe(utcDay(NEXT_DAY_START));
    expect(utcDay(NEXT_DAY_START)).toBe(utcDay(DAY_END) + 1);
  });
});

describe("takeDailyUsage", () => {
  // spec: Scenario「1日の上限を超える要求を拒む」
  it(`${DAILY_IMPORT_LIMIT}件ちょうどまで受け付ける`, async () => {
    const db = createTestDb();

    for (let i = 0; i < DAILY_IMPORT_LIMIT / 20; i++) {
      expect(await takeDailyUsage(db, { userId: USER, count: 20, now: DAY_START })).toMatchObject({
        ok: true,
      });
    }

    // 100 に達したので、1件でも拒む
    expect(await takeDailyUsage(db, { userId: USER, count: 1, now: DAY_START })).toMatchObject({
      ok: false,
      remaining: 0,
    });
  });

  // spec: Scenario「1日の上限を超える要求を拒む」
  it("90件のあとの20件を拒み、残りの10件を返す", async () => {
    const db = createTestDb();

    expect(await takeDailyUsage(db, { userId: USER, count: 90, now: DAY_START })).toMatchObject({
      ok: true,
      remaining: 10,
    });

    const over = await takeDailyUsage(db, { userId: USER, count: 20, now: DAY_START });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.remaining).toBe(10);
  });

  it("拒んだときは、翌日までの秒数を返す", async () => {
    const db = createTestDb();
    await takeDailyUsage(db, { userId: USER, count: 100, now: DAY_START });

    const over = await takeDailyUsage(db, { userId: USER, count: 1, now: DAY_START });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.retryAfterSeconds).toBe(DAY_MS / 1000);
  });

  // spec: Scenario「翌日には受け付ける」
  it("UTC の 23:59:59.999 と翌日 00:00:00.000 を別の日として数える", async () => {
    const db = createTestDb();
    await takeDailyUsage(db, { userId: USER, count: 100, now: DAY_END });

    // 同じ UTC の日なので拒む
    expect(await takeDailyUsage(db, { userId: USER, count: 1, now: DAY_END })).toMatchObject({
      ok: false,
    });
    // 翌日（UTC）なので受け付ける
    expect(await takeDailyUsage(db, { userId: USER, count: 1, now: NEXT_DAY_START })).toMatchObject(
      { ok: true },
    );
  });

  // L07: 地域の時刻表現に引きずられないこと
  it("絶対時刻が同じなら、地域の表現が違っても同じ日として数える", async () => {
    const db = createTestDb();
    // Auckland の表現で上限まで確保する
    const auckland = Date.parse("2026-09-28T12:59:59.999+13:00");
    await takeDailyUsage(db, { userId: USER, count: 100, now: auckland });

    // 同じ瞬間。Z の表現で来ても同じ日なので拒む
    expect(await takeDailyUsage(db, { userId: USER, count: 1, now: DAY_END })).toMatchObject({
      ok: false,
    });
    // 翌日（UTC）は受け付ける
    expect(await takeDailyUsage(db, { userId: USER, count: 1, now: NEXT_DAY_START })).toMatchObject(
      { ok: true },
    );
  });

  it("利用者ごとに別々に数える", async () => {
    const db = createTestDb();
    await takeDailyUsage(db, { userId: USER, count: 100, now: DAY_START });

    expect(await takeDailyUsage(db, { userId: OTHER, count: 20, now: DAY_START })).toMatchObject({
      ok: true,
      remaining: 80,
    });
  });
});
