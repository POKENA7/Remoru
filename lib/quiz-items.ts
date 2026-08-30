import { and, eq, isNull } from "drizzle-orm";
import { memos, type QuizItem, quizItems, reviewSchedules } from "../db/schema";
import type { AppDb } from "../db/types";
import { isGenerating } from "./quiz-generation";
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  type QuizTextError,
  validateQuizItem,
} from "./quiz-text";
import { initialSchedule, serializeState } from "./review-scheduler";

// 既存の import 元を変えずに済むよう、文字列の規則はここから再輸出する
export { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH, validateQuizItem };

export type QuizItemError = QuizTextError | "memo_not_found" | "already_exists";

export type CreateQuizItemResult =
  | { ok: true; quizItem: QuizItem; nextReviewAt: number }
  | { ok: false; error: QuizItemError };

/**
 * メモに問と答を1つ作り、最初の出題日を設定する。
 *
 * 現在時刻は呼び出し側から受け取る。スケジューラに渡す値がここで決まる。
 */
export async function createQuizItem(
  db: AppDb,
  params: {
    memoId: string;
    question: string;
    answer: string;
    now: number;
    userId: string;
  },
): Promise<CreateQuizItemResult> {
  const validated = validateQuizItem(params.question, params.answer);
  if (!validated.ok) return validated;

  const userId = params.userId;

  // 他人のメモに問答を付けられないよう、所有を確認してから書く
  const owned = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, userId)));
  if (owned.length === 0) return { ok: false, error: "memo_not_found" };

  const existing = await db
    .select({ id: quizItems.id })
    .from(quizItems)
    .where(eq(quizItems.memoId, params.memoId));

  if (existing.length > 0) {
    // 問答はあるのに予定が無い＝下の2つの insert のうち1つ目だけが通った
    // 状態。放っておくと一覧では「未作成」に見えるのに作成は
    // already_exists で拒まれ、**そのメモは削除しない限り復習に入れない。**
    // 生成は応答後の枠で走り、打ち切られうる（design.md Risks）ので、
    // この形の中途半端な書き込みは起こりうる前提で扱う。
    const scheduled = await db
      .select({ quizItemId: reviewSchedules.quizItemId })
      .from(reviewSchedules)
      .where(eq(reviewSchedules.quizItemId, existing[0].id));
    if (scheduled.length > 0) return { ok: false, error: "already_exists" };

    return await repairMissingSchedule(db, {
      quizItemId: existing[0].id,
      question: validated.question,
      answer: validated.answer,
      now: params.now,
    });
  }

  const quizItem: QuizItem = {
    id: crypto.randomUUID(),
    memoId: params.memoId,
    question: validated.question,
    answer: validated.answer,
    createdAt: params.now,
  };
  await db.insert(quizItems).values(quizItem);

  const first = initialSchedule(params.now);
  await db.insert(reviewSchedules).values({
    quizItemId: quizItem.id,
    nextReviewAt: first.nextReviewAt,
    state: serializeState(first.state),
  });

  return { ok: true, quizItem, nextReviewAt: first.nextReviewAt };
}

/**
 * すでにある問答の中身だけを書き換える。
 *
 * **行を消して作り直さない。** review_schedules は quiz_item_id に紐づいて
 * おり、消すと外部キーの連鎖で復習の段階まで消える（design.md D5）。
 * 書き換えなら、作り直しても進みが残る。
 */
export async function replaceQuizText(
  db: AppDb,
  params: { memoId: string; question: string; answer: string; userId: string },
): Promise<CreateQuizItemResult | { ok: false; error: QuizItemError }> {
  const validated = validateQuizItem(params.question, params.answer);
  if (!validated.ok) return validated;

  const owned = await db
    .select({ quizItemId: quizItems.id })
    .from(memos)
    .innerJoin(quizItems, eq(quizItems.memoId, memos.id))
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));
  if (owned.length === 0) return { ok: false, error: "memo_not_found" };

  await db
    .update(quizItems)
    .set({ question: validated.question, answer: validated.answer })
    .where(eq(quizItems.id, owned[0].quizItemId));

  const rows = await db.select().from(quizItems).where(eq(quizItems.id, owned[0].quizItemId));
  const schedule = await db
    .select({ nextReviewAt: reviewSchedules.nextReviewAt })
    .from(reviewSchedules)
    .where(eq(reviewSchedules.quizItemId, owned[0].quizItemId));

  return {
    ok: true,
    quizItem: rows[0],
    nextReviewAt: schedule[0]?.nextReviewAt ?? 0,
  };
}

/** そのメモの問と答を返す。持ち主でなければ null。 */
export async function getQuizItem(
  db: AppDb,
  params: { memoId: string; userId: string },
): Promise<{ question: string; answer: string } | null> {
  const rows = await db
    .select({ question: quizItems.question, answer: quizItems.answer })
    .from(memos)
    .innerJoin(quizItems, eq(quizItems.memoId, memos.id))
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));
  return rows[0] ?? null;
}

/**
 * 予定の無い問答を、呼び出し側が渡した中身で完成させる。
 *
 * 中途半端な書き込みは、次にその問答を作ろうとした人の入力で直す。
 * 消して作り直さないのは、すでに他の行が参照している可能性を残さない
 * ため（現状は無いが、消す理由も無い）。
 */
async function repairMissingSchedule(
  db: AppDb,
  params: { quizItemId: string; question: string; answer: string; now: number },
): Promise<CreateQuizItemResult> {
  await db
    .update(quizItems)
    .set({ question: params.question, answer: params.answer })
    .where(eq(quizItems.id, params.quizItemId));

  const first = initialSchedule(params.now);
  await db.insert(reviewSchedules).values({
    quizItemId: params.quizItemId,
    nextReviewAt: first.nextReviewAt,
    state: serializeState(first.state),
  });

  const rows = await db.select().from(quizItems).where(eq(quizItems.id, params.quizItemId));
  return { ok: true, quizItem: rows[0], nextReviewAt: first.nextReviewAt };
}

export type MemoReviewState =
  | { kind: "unwritten" }
  | { kind: "generating" }
  | { kind: "scheduled"; nextReviewAt: number; question: string };

/**
 * 一覧に出すための、メモごとの復習状態。
 *
 * 返すのは次回出題日だけで、スケジューラの内部状態は含めない
 * （design.md D2）。
 */
export async function getReviewStates(
  db: AppDb,
  userId: string,
  now: number,
): Promise<Map<string, MemoReviewState>> {
  const rows = await db
    .select({
      memoId: memos.id,
      quizPendingSince: memos.quizPendingSince,
      nextReviewAt: reviewSchedules.nextReviewAt,
      // 一覧には問だけを出す。**答えは返さない。** 想起の機会を壊さない
      // ため（通知に問いだけを載せているのと同じ理由）。
      question: quizItems.question,
    })
    .from(memos)
    .leftJoin(quizItems, eq(quizItems.memoId, memos.id))
    .leftJoin(reviewSchedules, eq(reviewSchedules.quizItemId, quizItems.id))
    .where(eq(memos.userId, userId));

  const states = new Map<string, MemoReviewState>();
  for (const row of rows) {
    // 問答があれば作成済み。無いときだけ、生成中かどうかを見る。
    // 生成が成功していれば pending が残っていても作成済みが勝つ。
    if (row.nextReviewAt !== null && row.nextReviewAt !== undefined) {
      states.set(row.memoId, {
        kind: "scheduled",
        nextReviewAt: row.nextReviewAt,
        question: row.question ?? "",
      });
    } else if (isGenerating(row.quizPendingSince ?? null, now)) {
      states.set(row.memoId, { kind: "generating" });
    } else {
      states.set(row.memoId, { kind: "unwritten" });
    }
  }
  return states;
}

/**
 * 問答が未作成のメモの件数。
 *
 * 生成中のものは含めない。まだ結果が出ていないものを「手で書くべきもの」
 * として数えると、待っているだけの利用者に催促が出る。
 */
export async function countUnwritten(db: AppDb, userId: string, now: number): Promise<number> {
  const rows = await db
    .select({ id: memos.id, quizPendingSince: memos.quizPendingSince })
    .from(memos)
    .leftJoin(quizItems, eq(quizItems.memoId, memos.id))
    .where(and(eq(memos.userId, userId), isNull(quizItems.id)));
  return rows.filter((r) => !isGenerating(r.quizPendingSince ?? null, now)).length;
}
