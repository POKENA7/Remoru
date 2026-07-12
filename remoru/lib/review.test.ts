import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { createManualMemo } from "./memos";
import { getDueReviewCards, submitReview } from "./review";
import { getOrCreateUser } from "./users";

const DAY = 24 * 60 * 60;

describe("getDueReviewCards", () => {
  it("returns only cards due at or before now, ordered by due date", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);

    // Apply Correction 1: Use getOrCreateUser instead of literal "user_1"
    const user = await getOrCreateUser(db, "clerk_test_user");

    const due = await createManualMemo(db, {
      userId: user.id,
      content: "due memo",
      question: "Q1",
      answer: "A1",
    });
    const notYetDue = await createManualMemo(db, {
      userId: user.id,
      content: "future memo",
      question: "Q2",
      answer: "A2",
    });

    // Force due dates deterministically for the test.
    const { reviewCards } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(reviewCards)
      .set({ dueDate: now - DAY })
      .where(eq(reviewCards.id, due.reviewCardId));
    await db
      .update(reviewCards)
      .set({ dueDate: now + 10 * DAY })
      .where(eq(reviewCards.id, notYetDue.reviewCardId));

    const cards = await getDueReviewCards(db, user.id, now);
    expect(cards).toHaveLength(1);
    expect(cards[0].cardId).toBe(due.reviewCardId);
    expect(cards[0].answer).toBe("A1");
  });
});

describe("submitReview", () => {
  it("applies the SM-2 algorithm and updates the review card", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);

    // Apply Correction 1: Use getOrCreateUser instead of literal "user_1"
    const user = await getOrCreateUser(db, "clerk_test_user_2");

    const memo = await createManualMemo(db, {
      userId: user.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    // Apply Correction 2: Pass userId as second parameter after cardId
    const result = await submitReview(db, memo.reviewCardId, user.id, "good", now);
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);

    const stillDue = await getDueReviewCards(db, user.id, now);
    expect(stillDue).toHaveLength(0);
  });

  it("throws when the review card does not exist", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);

    // Apply Correction 1: Use getOrCreateUser instead of literal "user_1"
    const user = await getOrCreateUser(db, "clerk_test_user_3");

    // Apply Correction 2: Pass userId as second parameter after cardId
    await expect(
      submitReview(db, "does-not-exist", user.id, "good", now),
    ).rejects.toThrow();
  });

  it("throws when the requesting user does not own the review card", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);

    // Apply Correction 2: Create two distinct users - owner and attacker
    const ownerUser = await getOrCreateUser(db, "clerk_owner_user");
    const attackerUser = await getOrCreateUser(db, "clerk_attacker_user");

    // Owner creates a memo (so a real review card exists)
    const memo = await createManualMemo(db, {
      userId: ownerUser.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    // Attacker tries to submit a review with their userId
    await expect(
      submitReview(db, memo.reviewCardId, attackerUser.id, "good", now),
    ).rejects.toThrow();
  });
});
