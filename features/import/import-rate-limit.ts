import { and, eq, lt, sql } from "drizzle-orm";
import { importRateLimits } from "../../db/schema";
import type { AppDb } from "../../db/types";

/**
 * 取り込みの速度の制限。
 *
 * design D6: **KV も Durable Objects も無い**ため、メモリ上の数え上げは
 * 分離されたインスタンス間で共有されない。表に行を置いて数える。
 *
 * 数え上げ自体は1文の upsert で行うので、同じ1分の中では正しい。厳密で
 * ないのは区切りの方である。1分の境目をまたぐ短い間に、2倍まで通ることが
 * ある。**守るのは濫用による費用の増大**であり、攻撃の遮断ではないため、
 * この精度で足りる。
 */

/** 1分の幅。 */
export const RATE_WINDOW_MS = 60_000;

/** 1分あたりに受け付ける回数。 */
export const RATE_LIMIT_PER_MINUTE = 60;

export type RateLimitOutcome =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/** その時刻が属する1分の番号。 */
export function windowStart(now: number): number {
  return Math.floor(now / RATE_WINDOW_MS);
}

/**
 * 1回分を数え、上限を超えていれば拒む。
 *
 * 前の1分より古い行は消す。残すと、使われなくなったトークンの行が
 * 増え続ける。
 */
export async function takeRateLimit(
  db: AppDb,
  params: { tokenId: string; now: number; limit?: number },
): Promise<RateLimitOutcome> {
  const limit = params.limit ?? RATE_LIMIT_PER_MINUTE;
  const window = windowStart(params.now);

  await db
    .delete(importRateLimits)
    .where(
      and(
        eq(importRateLimits.tokenId, params.tokenId),
        lt(importRateLimits.windowStart, window - 1),
      ),
    );

  // 1文で数える。読んでから書くと、同時の要求が同じ数を見る
  const rows = await db
    .insert(importRateLimits)
    .values({ tokenId: params.tokenId, windowStart: window, count: 1 })
    .onConflictDoUpdate({
      target: [importRateLimits.tokenId, importRateLimits.windowStart],
      set: { count: sql`${importRateLimits.count} + 1` },
    })
    .returning({ count: importRateLimits.count });

  const count = rows[0]?.count ?? 1;
  if (count > limit) {
    const retryAfterMs = (window + 1) * RATE_WINDOW_MS - params.now;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  return { ok: true, remaining: limit - count };
}
