import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { importRateLimits } from "@/db/schema";
import { createTestDb } from "@/tests/helpers/test-db";
import { issueToken } from "./import-tokens";
import { RATE_LIMIT_PER_MINUTE, RATE_WINDOW_MS, takeRateLimit } from "./import-rate-limit";

/** テスト用の利用者。 */
const USER = "user_a";

async function tokenId(db: ReturnType<typeof createTestDb>, name = "MacBook"): Promise<string> {
  const issued = await issueToken(db, { userId: USER, name, now: 1 });
  if (!issued.ok) throw new Error("発行できなかった");
  return issued.view.id;
}

describe("takeRateLimit", () => {
  // spec: Scenario「回数の上限を超えると429になる」
  it(`同じ1分のあいだに ${RATE_LIMIT_PER_MINUTE} 回まで受け付ける`, async () => {
    const db = createTestDb();
    const id = await tokenId(db);
    const now = 1_700_000_000_000;

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect(await takeRateLimit(db, { tokenId: id, now })).toMatchObject({ ok: true });
    }

    const over = await takeRateLimit(db, { tokenId: id, now });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("次の1分にはまた受け付ける", async () => {
    const db = createTestDb();
    const id = await tokenId(db);
    const now = 1_700_000_000_000;

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      await takeRateLimit(db, { tokenId: id, now });
    }
    expect((await takeRateLimit(db, { tokenId: id, now })).ok).toBe(false);

    const next = now + RATE_WINDOW_MS;
    expect((await takeRateLimit(db, { tokenId: id, now: next })).ok).toBe(true);
  });

  it("トークンごとに数える", async () => {
    const db = createTestDb();
    const a = await tokenId(db, "A");
    const b = await tokenId(db, "B");
    const now = 1_700_000_000_000;

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      await takeRateLimit(db, { tokenId: a, now });
    }

    expect((await takeRateLimit(db, { tokenId: a, now })).ok).toBe(false);
    expect((await takeRateLimit(db, { tokenId: b, now })).ok).toBe(true);
  });

  it("古い1分の数え上げを残さない", async () => {
    const db = createTestDb();
    const id = await tokenId(db);
    const now = 1_700_000_000_000;

    await takeRateLimit(db, { tokenId: id, now });
    await takeRateLimit(db, { tokenId: id, now: now + RATE_WINDOW_MS });
    await takeRateLimit(db, { tokenId: id, now: now + RATE_WINDOW_MS * 2 });

    // 使うのは今の1分と、その1つ前まで。それより古い行は消える
    const rows = await db.select().from(importRateLimits).where(eq(importRateLimits.tokenId, id));
    expect(rows).toHaveLength(2);
  });
});
