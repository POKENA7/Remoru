import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemo } from "@/features/memo/memos";
import { createQuizItem, getQuizItem, replaceQuizText } from "./quiz-items";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./quiz-text";
import { gradeReview } from "@/features/review/review";
import { createTestDb } from "@/lib/test-db";

/**
 * 問と答の書き直し（change 13）。
 *
 * AI での作り直しをやめ、外したときは人の手で直す。**触らないことが、
 * 復習の進み具合を保つことの実装そのもの**になっている。
 */

const NOW = Date.UTC(2026, 7, 28, 3, 0, 0);

async function seed(db: ReturnType<typeof createTestDb>, userId = "u1") {
  const memo = await createMemo(db, { content: "味噌汁は沸騰させない", now: NOW, userId });
  if (!memo.ok) throw new Error("メモを作れなかった");
  const quiz = await createQuizItem(db, {
    memoId: memo.memo.id,
    question: "最初の問",
    answer: "最初の答",
    now: NOW,
    userId,
  });
  if (!quiz.ok) throw new Error("問答を作れなかった");
  return { memoId: memo.memo.id, quizItemId: quiz.quizItem.id };
}

/** 何度か採点して段階を進める。 */
async function advance(db: ReturnType<typeof createTestDb>, quizItemId: string) {
  const { reviewSchedules } = await import("../../db/schema");
  for (let i = 0; i < 3; i++) {
    const rows = await db
      .select()
      .from(reviewSchedules)
      .where(eq(reviewSchedules.quizItemId, quizItemId));
    await gradeReview(db, {
      quizItemId,
      userId: "u1",
      recalled: true,
      occurrenceAt: rows[0].nextReviewAt,
      now: rows[0].nextReviewAt,
    });
  }
  const after = await db
    .select()
    .from(reviewSchedules)
    .where(eq(reviewSchedules.quizItemId, quizItemId));
  return after[0];
}

describe("問と答の書き直し", () => {
  it("書き直した内容が保存される", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await replaceQuizText(db, {
      memoId,
      question: "味噌汁を煮るときに避けることは？",
      answer: "沸騰させること",
      userId: "u1",
    });

    expect(result.ok).toBe(true);
    expect(await getQuizItem(db, { memoId, userId: "u1" })).toEqual({
      question: "味噌汁を煮るときに避けることは？",
      answer: "沸騰させること",
    });
  });

  it("空では保存できない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const noQ = await replaceQuizText(db, { memoId, question: "  ", answer: "答", userId: "u1" });
    const noA = await replaceQuizText(db, { memoId, question: "問", answer: "", userId: "u1" });

    expect(noQ).toEqual({ ok: false, error: "empty_question" });
    expect(noA).toEqual({ ok: false, error: "empty_answer" });
    // 弾かれたときは以前のものが残る
    expect(await getQuizItem(db, { memoId, userId: "u1" })).toEqual({
      question: "最初の問",
      answer: "最初の答",
    });
  });

  it("上限を超えると保存できない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const longQ = await replaceQuizText(db, {
      memoId,
      question: "あ".repeat(MAX_QUESTION_LENGTH + 1),
      answer: "答",
      userId: "u1",
    });
    const longA = await replaceQuizText(db, {
      memoId,
      question: "問",
      answer: "あ".repeat(MAX_ANSWER_LENGTH + 1),
      userId: "u1",
    });

    expect(longQ).toEqual({ ok: false, error: "too_long" });
    expect(longA).toEqual({ ok: false, error: "too_long" });
  });

  it("他人の問答は書き直せない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await replaceQuizText(db, {
      memoId,
      question: "乗っ取り",
      answer: "乗っ取り",
      userId: "u2",
    });

    expect(result).toEqual({ ok: false, error: "memo_not_found" });
    expect(await getQuizItem(db, { memoId, userId: "u1" })).toEqual({
      question: "最初の問",
      answer: "最初の答",
    });
  });
});

describe("書き直しは復習の進みを変えない", () => {
  it("次回出題日と段階が保たれる", async () => {
    const db = createTestDb();
    const { memoId, quizItemId } = await seed(db);
    const before = await advance(db, quizItemId);
    // 段階が進んでいること自体を先に確かめる（進んでいなければ検査にならない）
    expect(JSON.parse(before.state).stage).toBeGreaterThan(0);

    await replaceQuizText(db, {
      memoId,
      question: "新しい問",
      answer: "新しい答",
      userId: "u1",
    });

    const { reviewSchedules, quizItems } = await import("../../db/schema");
    const after = (
      await db.select().from(reviewSchedules).where(eq(reviewSchedules.quizItemId, quizItemId))
    )[0];
    expect(after.nextReviewAt).toBe(before.nextReviewAt);
    expect(after.state).toBe(before.state);

    // 行そのものが同じであること。消して作り直すと外部キーの連鎖で段階も消える
    const items = await db.select().from(quizItems).where(eq(quizItems.memoId, memoId));
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(quizItemId);
  });
});
