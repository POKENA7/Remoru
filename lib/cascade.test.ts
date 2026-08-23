import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { memos, quizItems, reviewSchedules } from "../db/schema";

/**
 * design.md D5: 削除はデータベース側で連鎖させる。
 * アプリ側で3テーブルを順に消す実装にしない。
 */
describe("メモ削除の連鎖", () => {
  async function seed() {
    const db = createTestDb();
    await db.insert(memos).values({
      id: "m1", userId: "u1", content: "近所のパン屋は火曜定休", createdAt: 1_000,
    });
    await db.insert(quizItems).values({
      id: "q1", memoId: "m1",
      question: "近所のパン屋の定休日は？", answer: "火曜日", createdAt: 1_000,
    });
    await db.insert(reviewSchedules).values({
      quizItemId: "q1", nextReviewAt: 90_000, state: '{"stage":0,"recoverTo":null}',
    });
    return db;
  }

  it("外部キーが有効になっている", async () => {
    const db = createTestDb();
    // 存在しないメモを参照する問答は挿入できない
    await expect(
      db.insert(quizItems).values({
        id: "q0", memoId: "missing", question: "q", answer: "a", createdAt: 1,
      }),
    ).rejects.toThrow();
  });

  it("メモを消すと問答とスケジュールも消える", async () => {
    const db = await seed();

    await db.delete(memos).where(eq(memos.id, "m1"));

    await expect(db.select().from(memos)).resolves.toEqual([]);
    await expect(db.select().from(quizItems)).resolves.toEqual([]);
    await expect(db.select().from(reviewSchedules)).resolves.toEqual([]);
  });

  it("他のメモは巻き添えにならない", async () => {
    const db = await seed();
    await db.insert(memos).values({
      id: "m2", userId: "u1", content: "山田さんの誕生日は3月4日", createdAt: 2_000,
    });
    await db.insert(quizItems).values({
      id: "q2", memoId: "m2", question: "山田さんの誕生日は？", answer: "3月4日", createdAt: 2_000,
    });

    await db.delete(memos).where(eq(memos.id, "m1"));

    const remainingMemos = await db.select().from(memos);
    const remainingItems = await db.select().from(quizItems);
    expect(remainingMemos.map((m) => m.id)).toEqual(["m2"]);
    expect(remainingItems.map((q) => q.id)).toEqual(["q2"]);
  });

  it("1メモに問答は1つまで", async () => {
    const db = await seed();
    await expect(
      db.insert(quizItems).values({
        id: "q9", memoId: "m1", question: "別の問", answer: "別の答", createdAt: 3_000,
      }),
    ).rejects.toThrow();
  });
});
