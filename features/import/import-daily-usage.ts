import { and, eq, sql } from "drizzle-orm";
import { importDailyUsage } from "../../db/schema";
import type { AppDb } from "../../db/types";

/**
 * 取り込みの1日の件数の確保。
 *
 * design D6: 費用の歯止め。数える単位は要求ではなく**件数**、相手はトークン
 * ではなく**利用者**にする。1回に20件を送れるため、回数で数えると件数が
 * 20倍まで膨らむ。
 *
 * 1日の区切りは **UTC の日付**。費用の歯止めであり、利用者に見せる日付では
 * ないので、利用者の地域に合わせない（L07）。
 *
 * 確保は1文の upsert で行う。同時の要求があっても件数は正しい。
 */

/** 1日（UTC）の幅。 */
export const DAY_MS = 86_400_000;

/** 利用者ごとの1日の登録件数の上限。暫定。実使用を見て見直す（design D6）。 */
export const DAILY_IMPORT_LIMIT = 100;

/**
 * その時刻が属する UTC の日（エポックミリ秒を1日の幅で割った整数）。
 *
 * `Date` のローカル時刻（`getDate` など）は使わない。使うと `TZ` によって
 * 日の境目が動き、地域ごとに数え方が変わってしまう（L07）。
 */
export function utcDay(now: number): number {
  return Math.floor(now / DAY_MS);
}

export type DailyUsageOutcome =
  | { ok: true; remaining: number }
  | { ok: false; remaining: number; retryAfterSeconds: number };

/**
 * 送られた件数を確保する。**上限を超えるなら確保せず、拒む。**
 *
 * 確保した件数は検証で落ちた件も含む（design D6）。検証落ちのたびに枠を
 * 返すより単純で、上限に対して十分に小さい。
 */
export async function takeDailyUsage(
  db: AppDb,
  params: { userId: string; count: number; now: number; limit?: number },
): Promise<DailyUsageOutcome> {
  const limit = params.limit ?? DAILY_IMPORT_LIMIT;
  const day = utcDay(params.now);
  const count = params.count;

  // 1文で確保する。`setWhere` が偽なら更新されず、RETURNING も空になる。
  // 読んでから書くと、同時の要求が同じ数を見る
  const rows = await db
    .insert(importDailyUsage)
    .values({ userId: params.userId, day, count })
    .onConflictDoUpdate({
      target: [importDailyUsage.userId, importDailyUsage.day],
      set: { count: sql`${importDailyUsage.count} + ${count}` },
      // 確保すると上限を超えるなら、更新しない
      setWhere: sql`${importDailyUsage.count} + ${count} <= ${limit}`,
    })
    .returning({ count: importDailyUsage.count });

  if (rows.length > 0) {
    return { ok: true, remaining: Math.max(0, limit - rows[0].count) };
  }

  // 確保できなかった。いまの件数を読み、翌日（UTC）までの秒数を返す
  const current = await db
    .select({ count: importDailyUsage.count })
    .from(importDailyUsage)
    .where(and(eq(importDailyUsage.userId, params.userId), eq(importDailyUsage.day, day)));

  const used = current[0]?.count ?? 0;
  const nextDayStart = (day + 1) * DAY_MS;

  return {
    ok: false,
    remaining: Math.max(0, limit - used),
    retryAfterSeconds: Math.max(1, Math.ceil((nextDayStart - params.now) / 1000)),
  };
}
