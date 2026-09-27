import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { importTokens } from "@/db/schema";
import { createTestDb } from "@/tests/helpers/test-db";
import { authenticateToken, getTokenView, issueToken, revokeToken } from "./import-tokens";

/** テスト用の利用者。認証導入後は userId が必須になった。 */
const USER = "user_a";
const OTHER = "user_b";

async function countRows(db: ReturnType<typeof createTestDb>, userId: string): Promise<number> {
  const rows = await db.select().from(importTokens).where(eq(importTokens.userId, userId));
  return rows.length;
}

describe("issueToken", () => {
  it("平文を返し、平文そのものは保存しない", async () => {
    const db = createTestDb();

    const result = await issueToken(db, { userId: USER, now: 1_700_000_000_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // spec: Scenario「トークンを発行する」
    expect(result.token.startsWith("rem_")).toBe(true);

    const stored = await db.select().from(importTokens).where(eq(importTokens.id, result.view.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(result.token);
    expect(stored[0].tokenHash).toHaveLength(64);
    expect(stored[0].userId).toBe(USER);
  });

  it("発行のたびに違うトークンを作る", async () => {
    const db = createTestDb();

    const first = await issueToken(db, { userId: USER, now: 1 });
    const second = await issueToken(db, { userId: USER, now: 2 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.token).not.toBe(second.token);
  });

  // spec: Scenario「トークンを再発行する」
  it("再発行すると古い1個が消え、新しい1個だけ残る", async () => {
    const db = createTestDb();
    const first = await issueToken(db, { userId: USER, now: 1 });
    if (!first.ok) throw new Error("発行できなかった");

    const second = await issueToken(db, { userId: USER, now: 2 });
    if (!second.ok) throw new Error("再発行できなかった");

    expect(await countRows(db, USER)).toBe(1);
    expect(await getTokenView(db, USER)).toEqual({ id: second.view.id, createdAt: 2 });
  });

  // spec: Scenario「トークンを再発行する」
  it("再発行のあと、古いトークンは null になる", async () => {
    const db = createTestDb();
    const first = await issueToken(db, { userId: USER, now: 1 });
    if (!first.ok) throw new Error("発行できなかった");

    await issueToken(db, { userId: USER, now: 2 });

    expect(await authenticateToken(db, first.token)).toBeNull();
  });

  it("再発行を挟んでも、もう一方の利用者に影響しない", async () => {
    const db = createTestDb();
    const mine = await issueToken(db, { userId: USER, now: 1 });
    const theirs = await issueToken(db, { userId: OTHER, now: 1 });
    if (!mine.ok || !theirs.ok) throw new Error("発行できなかった");

    await issueToken(db, { userId: USER, now: 2 });

    expect(await authenticateToken(db, theirs.token)).toEqual({
      userId: OTHER,
      tokenId: theirs.view.id,
    });
    await expect(getTokenView(db, OTHER)).resolves.toEqual({ id: theirs.view.id, createdAt: 1 });
  });
});

describe("authenticateToken", () => {
  it("有効なトークンから持ち主を返す", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await authenticateToken(db, issued.token)).toEqual({
      userId: USER,
      tokenId: issued.view.id,
    });
  });

  it("知らないトークンを拒否する", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, now: 1 });

    expect(await authenticateToken(db, "rem_00000000000000000000000000000000")).toBeNull();
  });

  it("接頭辞の無い文字列を拒否する", async () => {
    const db = createTestDb();
    expect(await authenticateToken(db, "abc")).toBeNull();
  });

  // spec: Scenario「トークンを失効する」
  it("失効したトークンを拒否する", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await revokeToken(db, { userId: USER })).toBe(true);
    expect(await authenticateToken(db, issued.token)).toBeNull();
  });
});

describe("revokeToken", () => {
  it("失効させると行が消え、有無は null になる", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, now: 1 });

    await revokeToken(db, { userId: USER });

    expect(await countRows(db, USER)).toBe(0);
    expect(await getTokenView(db, USER)).toBeNull();
  });

  it("他人のトークンは失効させない", async () => {
    const db = createTestDb();
    const mine = await issueToken(db, { userId: USER, now: 1 });
    const theirs = await issueToken(db, { userId: OTHER, now: 1 });
    if (!mine.ok || !theirs.ok) throw new Error("発行できなかった");

    expect(await revokeToken(db, { userId: OTHER })).toBe(true);

    // OTHER のものだけ消える
    expect(await authenticateToken(db, mine.token)).toEqual({
      userId: USER,
      tokenId: mine.view.id,
    });
    expect(await authenticateToken(db, theirs.token)).toBeNull();
  });

  it("存在しないトークンは false を返す", async () => {
    const db = createTestDb();
    expect(await revokeToken(db, { userId: USER })).toBe(false);
  });
});

describe("getTokenView", () => {
  // spec: Scenario「他人のトークンは見えない」
  it("自分のトークンだけを返す", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: OTHER, now: 1 });
    await issueToken(db, { userId: USER, now: 3 });

    const view = await getTokenView(db, USER);
    expect(view).toEqual({ id: expect.any(String), createdAt: 3 });
  });

  it("トークンが無ければ null", async () => {
    const db = createTestDb();
    expect(await getTokenView(db, USER)).toBeNull();
  });

  it("ハッシュを返さない", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, now: 1 });

    const view = await getTokenView(db, USER);
    expect(Object.keys(view ?? {}).sort()).toEqual(["createdAt", "id"]);
  });
});
