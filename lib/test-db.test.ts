import { describe, it, expect } from "vitest";
import { createTestDb } from "./test-db";
import { memos } from "../db/schema";

describe("createTestDb", () => {
  it("マイグレーション適用済みの memos テーブルを持つ", async () => {
    const db = createTestDb();
    await expect(db.select().from(memos)).resolves.toEqual([]);
  });

  it("挿入した行を読み戻せる", async () => {
    const db = createTestDb();
    await db.insert(memos).values({
      id: "m1",
      userId: "u1",
      content: "テスト",
      createdAt: 1000,
    });

    const rows = await db.select().from(memos);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("テスト");
  });

  it("呼び出しごとに独立したデータベースを返す", async () => {
    const a = createTestDb();
    await a.insert(memos).values({
      id: "m1",
      userId: "u1",
      content: "A",
      createdAt: 1000,
    });

    const b = createTestDb();
    await expect(b.select().from(memos)).resolves.toEqual([]);
  });
});
