import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { createManualMemo } from "./memos";
import { getOrCreateUser } from "./users";
import { memos, quizItems, reviewCards } from "../db/schema";

describe("createManualMemo", () => {
  it("creates a memo, a ready quiz item, and an initial review card", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_test_user");
    const result = await createManualMemo(db, {
      userId: user.id,
      content: "駅前のパン屋は水曜定休",
      question: "駅前のパン屋の定休日は？",
      answer: "水曜日",
    });

    const [memo] = await db
      .select()
      .from(memos)
      .where(eq(memos.id, result.memoId));
    expect(memo.quizMode).toBe("manual");

    const [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, result.quizItemId));
    expect(quizItem.status).toBe("ready");
    expect(quizItem.answer).toBe("水曜日");

    const [card] = await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.id, result.reviewCardId));
    expect(card.repetitions).toBe(0);
    expect(card.easeFactor).toBe(2.5);
    expect(card.dueDate).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
