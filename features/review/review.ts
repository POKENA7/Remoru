import { and, asc, eq, lte } from "drizzle-orm";
import { memos, quizItems, reviewEvents, reviewSchedules } from "../../db/schema";
import type { AppDb } from "../../db/types";
import { parseState, schedule, serializeState, startOfReviewDay } from "./review-scheduler";

export type DueItem = {
  quizItemId: string;
  memoId: string;
  question: string;
  answer: string;
  memoContent: string;
  /** いま表示している出題の識別に使う。採点時にそのまま送り返す（design.md D4）。 */
  occurrenceAt: number;
};

/**
 * その日の出題対象を、次回出題日の古い順に返す。
 *
 * 問答を持たないメモは join で自然に外れる。まだ期日の来ていないものは
 * 復習日の境界で切る。
 */
export async function getDueItems(db: AppDb, now: number, userId: string): Promise<DueItem[]> {
  const today = startOfReviewDay(now);

  const rows = await db
    .select({
      quizItemId: quizItems.id,
      memoId: memos.id,
      question: quizItems.question,
      answer: quizItems.answer,
      memoContent: memos.content,
      occurrenceAt: reviewSchedules.nextReviewAt,
    })
    .from(reviewSchedules)
    .innerJoin(quizItems, eq(quizItems.id, reviewSchedules.quizItemId))
    .innerJoin(memos, eq(memos.id, quizItems.memoId))
    .where(and(eq(memos.userId, userId), lte(reviewSchedules.nextReviewAt, today)))
    .orderBy(asc(reviewSchedules.nextReviewAt), asc(quizItems.id));

  return rows;
}

export type GradeError = "not_found";

export type GradeResult =
  | { ok: true; nextReviewAt: number; applied: boolean }
  | { ok: false; error: GradeError };

/**
 * 自己採点を記録する。
 *
 * べき等（design.md D4）。クライアントが表示していた出題日 `occurrenceAt` と
 * 保存済みの `nextReviewAt` を突き合わせ、一致しなければすでに採点済みと
 * みなして何もせず成功を返す。採点が適用されると日付が動くので、同じ要求を
 * 二度送っても二度目は一致しない。専用の履歴テーブルを持たずに済む。
 */
export async function gradeReview(
  db: AppDb,
  params: {
    quizItemId: string;
    recalled: boolean;
    occurrenceAt: number;
    now: number;
    userId: string;
  },
): Promise<GradeResult> {
  const userId = params.userId;

  const rows = await db
    .select({
      quizItemId: reviewSchedules.quizItemId,
      nextReviewAt: reviewSchedules.nextReviewAt,
      state: reviewSchedules.state,
    })
    .from(reviewSchedules)
    .innerJoin(quizItems, eq(quizItems.id, reviewSchedules.quizItemId))
    .innerJoin(memos, eq(memos.id, quizItems.memoId))
    .where(and(eq(reviewSchedules.quizItemId, params.quizItemId), eq(memos.userId, userId)));

  const current = rows[0];
  if (!current) return { ok: false, error: "not_found" };

  // すでに採点済み。二重送信なので何もしない。
  if (current.nextReviewAt !== params.occurrenceAt) {
    return { ok: true, nextReviewAt: current.nextReviewAt, applied: false };
  }

  const result = schedule(parseState(current.state), { recalled: params.recalled }, params.now);

  await db
    .update(reviewSchedules)
    .set({
      nextReviewAt: result.nextReviewAt,
      state: serializeState(result.state),
    })
    .where(eq(reviewSchedules.quizItemId, params.quizItemId));

  /*
   * 採点の出来事を残す（learning-record）。**更新のあとに行う。**
   *
   * D1 は対話的なトランザクションを持たず、テストで使う better-sqlite3 は
   * batch を持たないので、両方で動く原子的な書き方が無い。順序で倒れ方を
   * 選ぶ：更新が先なら next_review_at が動くので、挿入が落ちても押し直しは
   * 二重送信として弾かれる（記録1件の取りこぼしで済む）。逆順だと、記録が
   * 二重になり、間隔が負になってその問答が層から消える。
   */
  await db.insert(reviewEvents).values({
    id: crypto.randomUUID(),
    quizItemId: params.quizItemId,
    occurredAt: params.now,
    recalled: params.recalled,
  });

  return { ok: true, nextReviewAt: result.nextReviewAt, applied: true };
}
