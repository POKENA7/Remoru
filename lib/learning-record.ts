import { and, eq, sql } from "drizzle-orm";
import { memos, quizItems, reviewEvents, reviewSchedules } from "../db/schema";
import type { AppDb } from "../db/types";
import { startOfReviewDay } from "./review-scheduler";
import { countByLayer } from "./retention-layers";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 思い出せた回数の累計。
 *
 * **この値は減らない**（spec の要件）。忘れることがあっても、過去に
 * 思い出せたという事実は変わらない。思い出せなかった回は数えない。
 */
export async function totalRecalled(db: AppDb, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(reviewEvents)
    .innerJoin(quizItems, eq(quizItems.id, reviewEvents.quizItemId))
    .innerJoin(memos, eq(memos.id, quizItems.memoId))
    .where(and(eq(memos.userId, userId), eq(reviewEvents.recalled, true)));
  return rows[0]?.n ?? 0;
}

/**
 * いま持っているものを、出題間隔の長さごとに数える。
 *
 * **スケジューラの内部状態は読まない**（design.md D4）。間隔は公開されて
 * いる次回出題日と、こちらが持っている記録から導く。
 *
 *   間隔 = 次回出題日 − 最後に採点した日
 *
 * 算出方式を差し替えても次回出題日は必ずあるので、この計算はそのまま動く。
 *
 * **記録の無い問答は数えない。** 作成日を起点にすると、間隔ではなく
 * 「問答の古さ」を測ってしまう（review_events は change 10 で作った表なので、
 * それ以前の問答は採点済みでも記録が無い）。一度も採点していない問答は
 * 必ず間隔1日でどの層にも入らないので、外しても失うものは無い。
 */
export async function retentionLayers(
  db: AppDb,
  userId: string,
): Promise<{ label: string; count: number }[]> {
  const rows = await db
    .select({
      nextReviewAt: reviewSchedules.nextReviewAt,
      lastGradedAt: sql<number>`max(${reviewEvents.occurredAt})`,
    })
    .from(reviewSchedules)
    .innerJoin(quizItems, eq(quizItems.id, reviewSchedules.quizItemId))
    .innerJoin(memos, eq(memos.id, quizItems.memoId))
    // 記録のある問答だけ。無いものは起点が取れない
    .innerJoin(reviewEvents, eq(reviewEvents.quizItemId, quizItems.id))
    .where(eq(memos.userId, userId))
    .groupBy(reviewSchedules.quizItemId);

  const intervals = rows.map((row) =>
    Math.round((row.nextReviewAt - startOfReviewDay(row.lastGradedAt)) / DAY_MS),
  );

  return countByLayer(intervals);
}
