import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { importRateLimits, importTokens } from "@/db/schema";
import {
  authenticateToken,
  issueToken,
  listTokens,
  revokeToken,
  validateTokenName,
} from "./import-tokens";
import { takeRateLimit } from "./import-rate-limit";
import { MAX_TOKEN_NAME_LENGTH } from "./types";

/** テスト用の利用者。認証導入後は userId が必須になった。 */
const USER = "user_a";
const OTHER = "user_b";

describe("validateTokenName", () => {
  it("空文字を拒否する", () => {
    expect(validateTokenName("")).toEqual({ ok: false, error: "empty_name" });
  });

  it("空白文字のみを拒否する", () => {
    expect(validateTokenName("  　 ")).toEqual({ ok: false, error: "empty_name" });
  });

  it("前後の空白を除去した名前を返す", () => {
    expect(validateTokenName("  MacBook  ")).toEqual({ ok: true, name: "MacBook" });
  });

  it(`${MAX_TOKEN_NAME_LENGTH}文字ちょうどは受け付ける`, () => {
    const name = "あ".repeat(MAX_TOKEN_NAME_LENGTH);
    expect(validateTokenName(name)).toEqual({ ok: true, name });
  });

  it(`${MAX_TOKEN_NAME_LENGTH}文字を超えると拒否する`, () => {
    expect(validateTokenName("あ".repeat(MAX_TOKEN_NAME_LENGTH + 1))).toEqual({
      ok: false,
      error: "too_long_name",
    });
  });
});

describe("issueToken", () => {
  it("平文を返し、平文そのものは保存しない", async () => {
    const db = createTestDb();

    const result = await issueToken(db, { userId: USER, name: "MacBook", now: 1_700_000_000_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // spec: Scenario「トークンを発行する」
    expect(result.token.startsWith("rem_")).toBe(true);

    const stored = await db.select().from(importTokens).where(eq(importTokens.id, result.view.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(result.token);
    expect(stored[0].tokenHash).toHaveLength(64);
    expect(stored[0].userId).toBe(USER);
    expect(stored[0].revokedAt).toBeNull();
  });

  it("発行のたびに違うトークンを作る", async () => {
    const db = createTestDb();

    const first = await issueToken(db, { userId: USER, name: "A", now: 1 });
    const second = await issueToken(db, { userId: USER, name: "B", now: 2 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.token).not.toBe(second.token);
  });

  it("空の名前を拒否し、保存しない", async () => {
    const db = createTestDb();

    const result = await issueToken(db, { userId: USER, name: "   ", now: 1 });
    expect(result.ok).toBe(false);
    expect(await listTokens(db, USER)).toHaveLength(0);
  });
});

describe("authenticateToken", () => {
  it("有効なトークンから持ち主を返す", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, name: "MacBook", now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await authenticateToken(db, issued.token)).toEqual({
      userId: USER,
      tokenId: issued.view.id,
    });
  });

  it("知らないトークンを拒否する", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, name: "MacBook", now: 1 });

    expect(await authenticateToken(db, "rem_00000000000000000000000000000000")).toBeNull();
  });

  it("接頭辞の無い文字列を拒否する", async () => {
    const db = createTestDb();
    expect(await authenticateToken(db, "abc")).toBeNull();
  });

  // spec: Scenario「トークンを失効する」
  it("失効したトークンを拒否する", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, name: "MacBook", now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await revokeToken(db, { userId: USER, tokenId: issued.view.id, now: 2 })).toBe(true);
    expect(await authenticateToken(db, issued.token)).toBeNull();
  });
});

describe("revokeToken", () => {
  it("他人のトークンは失効できない", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, name: "MacBook", now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await revokeToken(db, { userId: OTHER, tokenId: issued.view.id, now: 2 })).toBe(false);
    expect(await authenticateToken(db, issued.token)).not.toBeNull();
  });

  it("存在しないトークンは false を返す", async () => {
    const db = createTestDb();
    expect(await revokeToken(db, { userId: USER, tokenId: "missing", now: 1 })).toBe(false);
  });

  it("失効させると速度の制限の数え上げも消す", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, name: "MacBook", now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");
    await takeRateLimit(db, { tokenId: issued.view.id, now: 1_700_000_000_000 });

    await revokeToken(db, { userId: USER, tokenId: issued.view.id, now: 2 });

    const rows = await db
      .select()
      .from(importRateLimits)
      .where(eq(importRateLimits.tokenId, issued.view.id));
    expect(rows).toHaveLength(0);
  });
});

describe("listTokens", () => {
  // spec: Scenario「他人のトークンは見えない」
  it("自分のトークンだけを新しい順に返す", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, name: "古い", now: 1 });
    await issueToken(db, { userId: USER, name: "新しい", now: 3 });
    await issueToken(db, { userId: OTHER, name: "他人", now: 2 });

    const rows = await listTokens(db, USER);
    expect(rows.map((r) => r.name)).toEqual(["新しい", "古い"]);
  });

  it("ハッシュを返さない", async () => {
    const db = createTestDb();
    await issueToken(db, { userId: USER, name: "MacBook", now: 1 });

    const rows = await listTokens(db, USER);
    expect(Object.keys(rows[0]).sort()).toEqual(["createdAt", "id", "name", "revokedAt"]);
  });

  it("失効済みも含めて返す", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, name: "MacBook", now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");
    await revokeToken(db, { userId: USER, tokenId: issued.view.id, now: 2 });

    const rows = await listTokens(db, USER);
    expect(rows[0].revokedAt).toBe(2);
  });
});
