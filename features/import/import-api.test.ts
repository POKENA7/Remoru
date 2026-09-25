import { describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { listMemos } from "@/features/memo/memos";
import {
  badRequestResponse,
  importMemos,
  MAX_IMPORT_ITEMS,
  parseBearer,
  parseImportBody,
  rateLimitedResponse,
  tooManyItemsResponse,
  unauthorizedResponse,
} from "./import-api";

/** テスト用の利用者。 */
const USER = "user_a";
const OTHER = "user_b";

describe("parseBearer", () => {
  it("Bearer のトークンを取り出す", () => {
    expect(parseBearer("Bearer rem_abc")).toBe("rem_abc");
  });

  it("方式の大文字小文字を問わない", () => {
    expect(parseBearer("bearer rem_abc")).toBe("rem_abc");
  });

  it("前後の空白を無視する", () => {
    expect(parseBearer("  Bearer   rem_abc  ")).toBe("rem_abc");
  });

  it("方式が違えば null", () => {
    expect(parseBearer("Basic rem_abc")).toBeNull();
  });

  it("ヘッダが無ければ null", () => {
    expect(parseBearer(null)).toBeNull();
  });

  it("トークンが無ければ null", () => {
    expect(parseBearer("Bearer")).toBeNull();
  });
});

describe("parseImportBody", () => {
  it("本文の配列を受け付ける", () => {
    expect(parseImportBody(["近所のパン屋は火曜定休", "ハンバーグが美味しい"])).toEqual({
      ok: true,
      contents: ["近所のパン屋は火曜定休", "ハンバーグが美味しい"],
    });
  });

  it("配列でなければ拒否する", () => {
    expect(parseImportBody({ content: "x" })).toEqual({ ok: false, reason: "invalid_body" });
    expect(parseImportBody("x")).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("空の配列を拒否する", () => {
    expect(parseImportBody([])).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("文字列でない要素を含めば拒否する", () => {
    expect(parseImportBody(["ok", 1])).toEqual({ ok: false, reason: "invalid_body" });
  });

  // spec: Scenario「20件を超える要求を拒む」
  it(`${MAX_IMPORT_ITEMS}件ちょうどは受け付ける`, () => {
    const contents = Array.from({ length: MAX_IMPORT_ITEMS }, (_, i) => `memo ${i}`);
    expect(parseImportBody(contents).ok).toBe(true);
  });

  it(`${MAX_IMPORT_ITEMS}件を超えると拒否する`, () => {
    const contents = Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, i) => `memo ${i}`);
    expect(parseImportBody(contents)).toEqual({ ok: false, reason: "too_many" });
  });
});

describe("応答", () => {
  it("認証の失敗は401", async () => {
    const response = unauthorizedResponse();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("本文の形の失敗は400", async () => {
    expect(badRequestResponse("invalid_body").status).toBe(400);
    expect(badRequestResponse("invalid_limit").status).toBe(400);
    expect(badRequestResponse("invalid_tag").status).toBe(400);
  });

  it("件数超過は400", async () => {
    const response = tooManyItemsResponse();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "too_many" });
  });

  it("回数超過は429で、再試行までの秒数を返す", async () => {
    const response = rateLimitedResponse(12);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });
});

describe("importMemos", () => {
  // spec: Scenario「複数件を登録する」
  it("複数件を保存し、件ごとの成功を返す", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];

    const results = await importMemos({
      db,
      userId: USER,
      contents: ["ひとつめ", "ふたつめ"],
      now: 1_700_000_000_000,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });
    await Promise.all(pending);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await listMemos(db, USER)).toHaveLength(2);
  });

  // spec: Scenario「検証に落ちた件だけが失敗する」
  it("検証に落ちた件だけが失敗する", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];

    const results = await importMemos({
      db,
      userId: USER,
      contents: ["正しい", "   ", "あ".repeat(1001)],
      now: 1,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });
    await Promise.all(pending);

    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual({ ok: false, reason: "empty" });
    expect(results[2]).toEqual({ ok: false, reason: "too_long" });
    expect(await listMemos(db, USER)).toHaveLength(1);
  });

  it("保存したメモを持ち主に紐づける", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];

    await importMemos({
      db,
      userId: USER,
      contents: ["自分のメモ"],
      now: 1,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });
    await Promise.all(pending);

    expect(await listMemos(db, OTHER)).toHaveLength(0);
    expect(await listMemos(db, USER)).toHaveLength(1);
  });

  it("通ったメモには問答の生成を起こす", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];

    await importMemos({
      db,
      userId: USER,
      contents: ["生成を起こすメモ"],
      now: 1,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });

    // 鍵が無い環境では生成が起きず、未作成のまま残る（spec「生成の手段が使えない環境」）
    expect(pending).toHaveLength(1);
    await Promise.all(pending);

    const [memo] = await listMemos(db, USER);
    expect(memo.quizPendingSince).toBeNull();
  });
});
