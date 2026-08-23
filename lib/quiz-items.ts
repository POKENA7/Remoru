import { and, eq, isNull } from "drizzle-orm";
import { memos, quizItems, reviewSchedules, type QuizItem } from "../db/schema";
import type { AppDb } from "../db/types";
import { initialSchedule, serializeState } from "./review-scheduler";
import { SINGLE_USER_ID } from "./memos";

/** 問・答それぞれの長さ上限（文字数）。 */
export const MAX_QUESTION_LENGTH = 200;
export const MAX_ANSWER_LENGTH = 200;

export type QuizItemError =
  | "empty_question"
  | "empty_answer"
  | "too_long"
  | "memo_not_found"
  | "already_exists";

export type ValidatedQuizItem =
  | { ok: true; question: string; answer: string }
  | { ok: false; error: QuizItemError };

/**
 * 問と答を検証する。両方が必須。
 *
 * 片方だけの状態を保存させないことが要件であり、検証の失敗は想定された
 * 結果なので例外ではなく戻り値で表す。
 */
export function validateQuizItem(
  rawQuestion: string,
  rawAnswer: string,
): ValidatedQuizItem {
  const question = rawQuestion.trim();
  const answer = rawAnswer.trim();

  if (question.length === 0) return { ok: false, error: "empty_question" };
  if (answer.length === 0) return { ok: false, error: "empty_answer" };
  if ([...question].length > MAX_QUESTION_LENGTH) return { ok: false, error: "too_long" };
  if ([...answer].length > MAX_ANSWER_LENGTH) return { ok: false, error: "too_long" };

  return { ok: true, question, answer };
}

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
    userId?: string;
  },
): Promise<CreateQuizItemResult> {
  const validated = validateQuizItem(params.question, params.answer);
  if (!validated.ok) return validated;

  const userId = params.userId ?? SINGLE_USER_ID;

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
  if (existing.length > 0) return { ok: false, error: "already_exists" };

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

export type MemoReviewState =
  | { kind: "unwritten" }
  | { kind: "scheduled"; nextReviewAt: number };

/**
 * 一覧に出すための、メモごとの復習状態。
 *
 * 返すのは次回出題日だけで、スケジューラの内部状態は含めない
 * （design.md D2）。
 */
export async function getReviewStates(
  db: AppDb,
  userId: string = SINGLE_USER_ID,
): Promise<Map<string, MemoReviewState>> {
  const rows = await db
    .select({
      memoId: memos.id,
      nextReviewAt: reviewSchedules.nextReviewAt,
    })
    .from(memos)
    .leftJoin(quizItems, eq(quizItems.memoId, memos.id))
    .leftJoin(reviewSchedules, eq(reviewSchedules.quizItemId, quizItems.id))
    .where(eq(memos.userId, userId));

  const states = new Map<string, MemoReviewState>();
  for (const row of rows) {
    states.set(
      row.memoId,
      row.nextReviewAt === null || row.nextReviewAt === undefined
        ? { kind: "unwritten" }
        : { kind: "scheduled", nextReviewAt: row.nextReviewAt },
    );
  }
  return states;
}

/** 問答が未作成のメモの件数。 */
export async function countUnwritten(
  db: AppDb,
  userId: string = SINGLE_USER_ID,
): Promise<number> {
  const rows = await db
    .select({ id: memos.id })
    .from(memos)
    .leftJoin(quizItems, eq(quizItems.memoId, memos.id))
    .where(and(eq(memos.userId, userId), isNull(quizItems.id)));
  return rows.length;
}
