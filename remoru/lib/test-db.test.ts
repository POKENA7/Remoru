import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./test-db";

describe("createTestDb", () => {
  it("creates a database with all tables migrated", async () => {
    const db = createTestDb();
    const rows = await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table'`,
    );
    const names = rows.map((r: any) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "memos",
        "quiz_items",
        "review_cards",
        "push_subscriptions",
      ]),
    );
  });
});
