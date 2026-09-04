import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  localHourAndDate,
  type NotificationTarget,
  selectTargets,
  shouldNotify,
} from "./notification-timing";

/** 2026-08-23 21:00 JST = 12:00 UTC */
const AT_21_JST = Date.UTC(2026, 7, 23, 12, 0, 0);

const base: NotificationTarget = {
  userId: "u1",
  enabled: true,
  hour: 21,
  timeZone: "Asia/Tokyo",
  lastSentOn: null,
};
const t = (o: Partial<NotificationTarget> = {}): NotificationTarget => ({ ...base, ...o });

describe("localHourAndDate", () => {
  it("地域ごとに時と日付を返す", () => {
    expect(localHourAndDate(AT_21_JST, "Asia/Tokyo")).toEqual({ hour: 21, date: "2026-08-23" });
    expect(localHourAndDate(AT_21_JST, "UTC")).toEqual({ hour: 12, date: "2026-08-23" });
    // ニューヨークは同じ瞬間でもまだ前日の朝
    expect(localHourAndDate(AT_21_JST, "America/New_York")).toEqual({
      hour: 8,
      date: "2026-08-23",
    });
  });

  it("日付をまたぐ地域を正しく扱う", () => {
    // 2026-08-23 23:00 UTC → JST は翌日 08:00
    const late = Date.UTC(2026, 7, 23, 23, 0, 0);
    expect(localHourAndDate(late, "Asia/Tokyo")).toEqual({ hour: 8, date: "2026-08-24" });
  });

  it("不正なタイムゾーン名は null を返す", () => {
    expect(localHourAndDate(AT_21_JST, "Nowhere/Fake")).toBeNull();
    expect(localHourAndDate(AT_21_JST, "")).toBeNull();
  });
});

describe("shouldNotify（タスク 2.2）", () => {
  it("指定時刻と一致すれば送る", () => {
    expect(shouldNotify(t(), AT_21_JST)).toEqual({ send: true, localDate: "2026-08-23" });
  });

  it("時刻が違えば送らない", () => {
    expect(shouldNotify(t({ hour: 9 }), AT_21_JST)).toEqual({
      send: false,
      reason: "different_hour",
    });
  });

  it("地域が違えば同じ瞬間でも判定が変わる", () => {
    // UTC の利用者は 21時 を指定していても、この瞬間は 12時 なので送らない
    expect(shouldNotify(t({ timeZone: "UTC" }), AT_21_JST).send).toBe(false);
    // UTC で 12時 を指定していれば送る
    expect(shouldNotify(t({ timeZone: "UTC", hour: 12 }), AT_21_JST).send).toBe(true);
  });
});

describe("二重送信の抑止（タスク 2.3）", () => {
  it("同じ日にすでに送っていれば送らない", () => {
    expect(shouldNotify(t({ lastSentOn: "2026-08-23" }), AT_21_JST)).toEqual({
      send: false,
      reason: "already_sent_today",
    });
  });

  it("前日に送っていれば送る", () => {
    expect(shouldNotify(t({ lastSentOn: "2026-08-22" }), AT_21_JST).send).toBe(true);
  });

  it("日付の判定は利用者の地域で行う", () => {
    // 2026-08-23 15:30 UTC = JST では翌日 00:30
    const afterMidnightJst = Date.UTC(2026, 7, 23, 15, 30, 0);
    const target = t({ hour: 0, lastSentOn: "2026-08-23" });
    // UTC で見れば 8/23 だが、利用者の地域では 8/24 なので送ってよい
    expect(shouldNotify(target, afterMidnightJst)).toEqual({
      send: true,
      localDate: "2026-08-24",
    });
  });

  it("cron が同じ時刻に二度起きても一度しか送らない", () => {
    const first = shouldNotify(t(), AT_21_JST);
    expect(first.send).toBe(true);
    if (!first.send) return;
    // 記録を反映した状態で再度起きる
    const second = shouldNotify(t({ lastSentOn: first.localDate }), AT_21_JST + 60_000);
    expect(second).toEqual({ send: false, reason: "already_sent_today" });
  });
});

describe("通知が無効な利用者（タスク 2.5）", () => {
  it("無効なら時刻が一致しても送らない", () => {
    expect(shouldNotify(t({ enabled: false }), AT_21_JST)).toEqual({
      send: false,
      reason: "disabled",
    });
  });
});

describe("壊れた設定の扱い（タスク 2.4）", () => {
  it("不正な地域名の利用者は送らない", () => {
    expect(shouldNotify(t({ timeZone: "Nowhere/Fake" }), AT_21_JST)).toEqual({
      send: false,
      reason: "invalid_time_zone",
    });
  });

  it("壊れた設定の1人が、他の利用者への配信を止めない", () => {
    const targets = [
      t({ userId: "broken", timeZone: "Nowhere/Fake" }),
      t({ userId: "ok1" }),
      t({ userId: "broken2", timeZone: "" }),
      t({ userId: "ok2" }),
    ];

    const selected = selectTargets(targets, AT_21_JST);

    expect(selected.map((s) => s.userId)).toEqual(["ok1", "ok2"]);
  });
});

describe("selectTargets", () => {
  it("時刻が一致する利用者だけを選ぶ（タスク 2.2）", () => {
    const targets = [
      t({ userId: "tokyo21", timeZone: "Asia/Tokyo", hour: 21 }), // 一致
      t({ userId: "tokyo9", timeZone: "Asia/Tokyo", hour: 9 }), // 不一致
      t({ userId: "utc12", timeZone: "UTC", hour: 12 }), // 一致
      t({ userId: "ny8", timeZone: "America/New_York", hour: 8 }), // 一致
      t({ userId: "ny20", timeZone: "America/New_York", hour: 20 }), // 不一致
    ];

    const selected = selectTargets(targets, AT_21_JST);

    expect(selected.map((s) => s.userId)).toEqual(["tokyo21", "utc12", "ny8"]);
  });

  it("それぞれの地域での日付を返す", () => {
    // JST の深夜。UTC ではまだ前日
    const at0030Jst = Date.UTC(2026, 7, 23, 15, 30, 0);
    const selected = selectTargets(
      [t({ userId: "jst", hour: 0 }), t({ userId: "utc", timeZone: "UTC", hour: 15 })],
      at0030Jst,
    );
    expect(selected).toEqual([
      { userId: "jst", localDate: "2026-08-24" },
      { userId: "utc", localDate: "2026-08-23" },
    ]);
  });

  it("誰も一致しなければ空を返す", () => {
    expect(selectTargets([t({ hour: 3 })], AT_21_JST)).toEqual([]);
  });
});

describe("依存の向き（タスク 2.1）", () => {
  const SOURCE = readFileSync(
    join(process.cwd(), "features", "notification", "notification-timing.ts"),
    "utf8",
  );

  it("何も import していない", () => {
    const imports = [...SOURCE.matchAll(/^\s*import\s+[^;]*?from\s+["']([^"']+)["']/gm)];
    expect(imports.map((m) => m[1])).toEqual([]);
  });

  it("内部で時計を読んでいない", () => {
    expect(SOURCE).not.toMatch(/Date\.now\s*\(/);
    expect(SOURCE).not.toMatch(/new\s+Date\s*\(\s*\)/);
  });
});
