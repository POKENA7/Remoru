import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemo, listMemos, MAX_CONTENT_LENGTH, updateMemoContent } from "./memos";
import { createQuizItem } from "./quiz-items";
import { gradeReview } from "./review";
import { createTestDb } from "./test-db";

/**
 * メモ本文の書き直し（change 14）。
 *
 * **消して書き直すと復習の進み具合まで失う**（削除は cascade で問答と記録を
 * 巻き添えにする）。それを避けるための経路なので、進みが残ることが要点。
 */

const NOW = Date.UTC(2026, 7, 28, 3, 0, 0);

async function seed(db: ReturnType<typeof createTestDb>, userId = "u1") {
  const memo = await createMemo(db, { content: "近所のパン屋は火曜定休", now: NOW, userId });
  if (!memo.ok) throw new Error("メモを作れなかった");
  const quiz = await createQuizItem(db, {
    memoId: memo.memo.id,
    question: "パン屋の定休日は？",
    answer: "火曜",
    now: NOW,
    userId,
  });
  if (!quiz.ok) throw new Error("問答を作れなかった");
  return { memoId: memo.memo.id, quizItemId: quiz.quizItem.id };
}

async function advance(db: ReturnType<typeof createTestDb>, quizItemId: string) {
  const { reviewSchedules } = await import("../db/schema");
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
  return (
    await db.select().from(reviewSchedules).where(eq(reviewSchedules.quizItemId, quizItemId))
  )[0];
}

describe("メモ本文の書き直し", () => {
  it("書き直した本文が一覧にも出る", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await updateMemoContent(db, {
      memoId,
      content: "近所のパン屋は水曜定休",
      userId: "u1",
    });

    expect(result.ok).toBe(true);
    const rows = await listMemos(db, "u1");
    expect(rows[0].content).toBe("近所のパン屋は水曜定休");
  });

  it("空白のみでは保存できない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await updateMemoContent(db, { memoId, content: "  \n ", userId: "u1" });

    expect(result).toEqual({ ok: false, error: "empty" });
    expect((await listMemos(db, "u1"))[0].content).toBe("近所のパン屋は火曜定休");
  });

  it("上限を超えると保存できない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await updateMemoContent(db, {
      memoId,
      content: "あ".repeat(MAX_CONTENT_LENGTH + 1),
      userId: "u1",
    });

    expect(result).toEqual({ ok: false, error: "too_long" });
    expect((await listMemos(db, "u1"))[0].content).toBe("近所のパン屋は火曜定休");
  });

  it("前後の空白は落とす", async () => {
    // 投入時と同じ検証を通す（片方だけ緩めると書き直しで抜けられる）
    const db = createTestDb();
    const { memoId } = await seed(db);

    await updateMemoContent(db, { memoId, content: "  水曜定休  ", userId: "u1" });

    expect((await listMemos(db, "u1"))[0].content).toBe("水曜定休");
  });

  it("他人のメモは書き直せない", async () => {
    const db = createTestDb();
    const { memoId } = await seed(db);

    const result = await updateMemoContent(db, { memoId, content: "乗っ取り", userId: "u2" });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect((await listMemos(db, "u1"))[0].content).toBe("近所のパン屋は火曜定休");
  });
});

describe("本文を書き直しても復習の進みは残る", () => {
  it("次回出題日と段階が保たれ、問答も消えない", async () => {
    const db = createTestDb();
    const { memoId, quizItemId } = await seed(db);
    const before = await advance(db, quizItemId);
    expect(JSON.parse(before.state).stage).toBeGreaterThan(0);

    await updateMemoContent(db, { memoId, content: "近所のパン屋は水曜定休", userId: "u1" });

    const { reviewSchedules, quizItems } = await import("../db/schema");
    const after = (
      await db.select().from(reviewSchedules).where(eq(reviewSchedules.quizItemId, quizItemId))
    )[0];
    expect(after.nextReviewAt).toBe(before.nextReviewAt);
    expect(after.state).toBe(before.state);

    // 問答の行も残る。消して作り直すと連鎖で段階まで消える
    const items = await db.select().from(quizItems).where(eq(quizItems.memoId, memoId));
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(quizItemId);
    // 答えは古いまま残る ― だから同じ場面で直せるようにしてある（design.md D1）
    expect(items[0].answer).toBe("火曜");
  });
});
