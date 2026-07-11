import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import {
  createManualMemo,
  buildQuizPrompt,
  parseQuizResponse,
  generateQuizWithAI,
  generateQuizWithRetry,
  createAiMemoShell,
  completeAiQuizItem,
  fixFailedQuizItem,
  type WorkersAiBinding,
} from "./memos";
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

describe("buildQuizPrompt", () => {
  it("includes the memo content in the prompt", () => {
    const prompt = buildQuizPrompt("駅前のパン屋は水曜定休");
    expect(prompt).toContain("駅前のパン屋は水曜定休");
  });
});

describe("parseQuizResponse", () => {
  it("parses a JSON object embedded in surrounding text", () => {
    const raw = 'ok! {"question": "Q?", "answer": "A"} thanks';
    expect(parseQuizResponse(raw)).toEqual({ question: "Q?", answer: "A" });
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseQuizResponse("no json here")).toThrow();
  });
});

describe("generateQuizWithAI", () => {
  it("calls the AI binding and parses its response", async () => {
    const fakeAi: WorkersAiBinding = {
      run: async () => ({
        response: '{"question": "Q?", "answer": "A"}',
      }),
    };
    const qa = await generateQuizWithAI(fakeAi, "some memo content");
    expect(qa).toEqual({ question: "Q?", answer: "A" });
  });
});

describe("generateQuizWithRetry", () => {
  it("returns the result on the first success without retrying", async () => {
    let calls = 0;
    const fakeAi: WorkersAiBinding = {
      run: async () => {
        calls += 1;
        return { response: '{"question": "Q?", "answer": "A"}' };
      },
    };
    const qa = await generateQuizWithRetry(fakeAi, "some memo content");
    expect(qa).toEqual({ question: "Q?", answer: "A" });
    expect(calls).toBe(1);
  });

  it("retries once after a failure and succeeds on the second attempt", async () => {
    let calls = 0;
    const fakeAi: WorkersAiBinding = {
      run: async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient failure");
        return { response: '{"question": "Q?", "answer": "A"}' };
      },
    };
    const qa = await generateQuizWithRetry(fakeAi, "some memo content");
    expect(qa).toEqual({ question: "Q?", answer: "A" });
    expect(calls).toBe(2);
  });

  it("throws after the retry also fails, without a third attempt", async () => {
    let calls = 0;
    const fakeAi: WorkersAiBinding = {
      run: async () => {
        calls += 1;
        throw new Error("still failing");
      },
    };
    await expect(generateQuizWithRetry(fakeAi, "some memo content")).rejects.toThrow(
      "still failing",
    );
    expect(calls).toBe(2);
  });
});

describe("createAiMemoShell + completeAiQuizItem", () => {
  it("creates a pending quiz item, then fills it in and creates a review card on success", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_test_user");
    const shell = await createAiMemoShell(db, {
      userId: user.id,
      content: "駅前のパン屋は水曜定休",
    });

    let [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, shell.quizItemId));
    expect(quizItem.status).toBe("pending");

    await completeAiQuizItem(
      db,
      shell.quizItemId,
      { userId: user.id },
      { question: "Q?", answer: "A" },
    );

    [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, shell.quizItemId));
    expect(quizItem.status).toBe("ready");
    expect(quizItem.answer).toBe("A");

    const cards = await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.quizItemId, shell.quizItemId));
    expect(cards).toHaveLength(1);
  });

  it("marks the quiz item as failed when AI generation failed", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_test_user");
    const shell = await createAiMemoShell(db, {
      userId: user.id,
      content: "駅前のパン屋は水曜定休",
    });

    await completeAiQuizItem(db, shell.quizItemId, { userId: user.id }, null);

    const [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, shell.quizItemId));
    expect(quizItem.status).toBe("failed");

    const cards = await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.quizItemId, shell.quizItemId));
    expect(cards).toHaveLength(0);
  });
});

describe("fixFailedQuizItem", () => {
  it("fills in a failed quiz item's question/answer and creates its review card", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_test_user");
    const shell = await createAiMemoShell(db, {
      userId: user.id,
      content: "駅前のパン屋は水曜定休",
    });
    await completeAiQuizItem(db, shell.quizItemId, { userId: user.id }, null);

    const result = await fixFailedQuizItem(db, shell.quizItemId, {
      userId: user.id,
      question: "駅前のパン屋の定休日は？",
      answer: "水曜日",
    });

    const [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, shell.quizItemId));
    expect(quizItem.status).toBe("ready");
    expect(quizItem.answer).toBe("水曜日");

    const [card] = await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.id, result.reviewCardId));
    expect(card.repetitions).toBe(0);
    expect(card.easeFactor).toBe(2.5);
  });

  it("throws when the quiz item is not in failed status", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_test_user");
    const shell = await createAiMemoShell(db, {
      userId: user.id,
      content: "駅前のパン屋は水曜定休",
    });
    // still "pending" — never completed or failed

    await expect(
      fixFailedQuizItem(db, shell.quizItemId, {
        userId: user.id,
        question: "Q",
        answer: "A",
      }),
    ).rejects.toThrow();
  });

  it("throws when the requesting user does not own the quiz item's memo", async () => {
    const db = createTestDb();
    const owner = await getOrCreateUser(db, "clerk_owner_user");
    const attacker = await getOrCreateUser(db, "clerk_attacker_user");
    const shell = await createAiMemoShell(db, {
      userId: owner.id,
      content: "駅前のパン屋は水曜定休",
    });
    await completeAiQuizItem(db, shell.quizItemId, { userId: owner.id }, null);

    await expect(
      fixFailedQuizItem(db, shell.quizItemId, {
        userId: attacker.id,
        question: "Q",
        answer: "A",
      }),
    ).rejects.toThrow();

    const [quizItem] = await db
      .select()
      .from(quizItems)
      .where(eq(quizItems.id, shell.quizItemId));
    expect(quizItem.status).toBe("failed");
  });
});

