"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { createQuizItem, replaceQuizText } from "./quiz-items";
import type { WriteQuizResult } from "./types";

/**
 * 問と答の書き込みの入口。形は `features/memo/actions.ts` と同じ
 * （design.md D1・D4・D6）。
 */

/** メモに問と答を1つ作り、最初の出題日を決める。 */
export async function writeQuiz(
  memoId: string,
  question: string,
  answer: string,
): Promise<WriteQuizResult> {
  if (typeof memoId !== "string" || typeof question !== "string" || typeof answer !== "string") {
    return { ok: false, reason: "failed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await createQuizItem(db, {
      memoId,
      question,
      answer,
      now: Date.now(),
      userId,
    });
    // 持ち主でないメモは "memo_not_found"。他人のメモの有無を区別させない
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return {
      ok: true,
      question: result.quizItem.question,
      answer: result.quizItem.answer,
      nextReviewAt: result.nextReviewAt,
    };
  } catch (error) {
    console.error("問と答を作れなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * 問と答を書き直す。**受け取った内容で置き換えるだけ**で、モデルは呼ばない
 * （change 13 D5）。
 *
 * `replaceQuizText` は **review_schedules に触れない**。触らないことが、
 * 復習の進み具合を保つことの実装そのものになっている（spec の要件）。
 */
export async function rewriteQuiz(
  memoId: string,
  question: string,
  answer: string,
): Promise<WriteQuizResult> {
  if (typeof memoId !== "string" || typeof question !== "string" || typeof answer !== "string") {
    return { ok: false, reason: "failed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await replaceQuizText(db, { memoId, question, answer, userId });
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return {
      ok: true,
      question: result.quizItem.question,
      answer: result.quizItem.answer,
      nextReviewAt: result.nextReviewAt,
    };
  } catch (error) {
    console.error("問と答を書き直せなかった", error);
    return { ok: false, reason: "failed" };
  }
}
