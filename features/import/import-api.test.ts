import { describe, expect, it } from "vitest";
import { listMemos } from "@/features/memo/memos";
import { createTestDb } from "@/tests/helpers/test-db";
import {
  badRequestResponse,
  importMemos,
  importMemosResponse,
  listMemosResponse,
  MAX_IMPORT_ITEMS,
  parseBearer,
  parseImportBody,
  parseListMemosQuery,
  rateLimitedResponse,
  tooManyItemsResponse,
  unauthorizedResponse,
} from "./import-api";
import { takeDailyUsage } from "./import-daily-usage";

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

  // spec: Scenario「1日の上限を超える要求を拒む」
  it("1日の上限超過は429で、再試行までの秒数と残り件数を返す", async () => {
    const response = rateLimitedResponse(12, 7);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(await response.json()).toEqual({ error: "rate_limited", remaining: 7 });
  });
});

describe("parseListMemosQuery", () => {
  it("tag と limit を取り出す", () => {
    expect(parseListMemosQuery(new URLSearchParams({ tag: "t1", limit: "5" }))).toEqual({
      ok: true,
      tagId: "t1",
      limit: 5,
    });
  });

  it("指定が無ければ空の条件を返す", () => {
    expect(parseListMemosQuery(new URLSearchParams())).toEqual({
      ok: true,
      tagId: undefined,
      limit: undefined,
    });
  });

  it("空の tag を拒否する", () => {
    expect(parseListMemosQuery(new URLSearchParams({ tag: "" }))).toEqual({
      ok: false,
      reason: "invalid_tag",
    });
  });

  it("不正な limit を拒否する", () => {
    expect(parseListMemosQuery(new URLSearchParams({ limit: "0" }))).toEqual({
      ok: false,
      reason: "invalid_limit",
    });
    expect(parseListMemosQuery(new URLSearchParams({ limit: "abc" }))).toEqual({
      ok: false,
      reason: "invalid_limit",
    });
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

  // spec: Scenario「一覧が配列の順を保つ」
  it("配列の後ろの件ほど新しくなり、一覧は逆順になる", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];

    const results = await importMemos({
      db,
      userId: USER,
      contents: ["A", "B", "C"],
      now: 1_700_000_000_000,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });
    await Promise.all(pending);

    expect(results).toHaveLength(3);
    const memos = await listMemos(db, USER);
    expect(memos.map((m) => m.content)).toEqual(["C", "B", "A"]);
  });

  it("10件でも保存時刻が崩れず、一覧が逆順になる", async () => {
    const db = createTestDb();
    const pending: Promise<unknown>[] = [];
    const contents = Array.from({ length: 10 }, (_, i) => `memo ${i}`);

    await importMemos({
      db,
      userId: USER,
      contents,
      now: 1_700_000_000_000,
      apiKey: undefined,
      defer: (work) => pending.push(work),
    });
    await Promise.all(pending);

    const memos = await listMemos(db, USER);
    expect(memos.map((m) => m.content)).toEqual([...contents].reverse());
    // 同じ保存時刻が無いこと（あれば id の順に落ちる）
    const times = memos.map((m) => m.createdAt);
    expect(new Set(times).size).toBe(10);
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

describe("importMemosResponse", () => {
  /**
   * `POST /api/memos` の本体。**解釈 → 確保 → 保存**の順序をここで固定する。
   *
   * 経路そのものは `server-only` を通すためテストから呼べない（design D3）。
   */
  async function fillToLimit(db: ReturnType<typeof createTestDb>): Promise<void> {
    const pending: Promise<unknown>[] = [];
    const batch = Array.from({ length: 20 }, (_, i) => `memo ${i}`);
    const defer = (work: Promise<unknown>) => pending.push(work);

    for (let i = 0; i < 5; i++) {
      const response = await importMemosResponse({
        db,
        userId: USER,
        rawBody: batch,
        now: 1_700_000_000_000 + i * 1000,
        apiKey: undefined,
        defer,
      });
      expect(response.status).toBe(200);
    }
    await Promise.all(pending);
  }

  // spec: Scenario「1日の上限を超える要求を拒む」
  it("上限に達したあとの登録は429で、1件も増えない", async () => {
    const db = createTestDb();
    await fillToLimit(db);
    expect(await listMemos(db, USER)).toHaveLength(100);

    const over = await importMemosResponse({
      db,
      userId: USER,
      rawBody: ["あと1件"],
      now: 1_700_000_010_000,
      apiKey: undefined,
      defer: () => {},
    });

    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await over.json()).toMatchObject({ error: "rate_limited", remaining: 0 });
    expect(await listMemos(db, USER)).toHaveLength(100);
  });

  // spec: Scenario「読み取りは件数に数えない」
  it("上限に達しても、一覧は200で返る", async () => {
    const db = createTestDb();
    await fillToLimit(db);

    const response = await listMemosResponse({
      db,
      userId: USER,
      searchParams: new URLSearchParams(),
      now: 1_700_000_010_000,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { memos: unknown[] };
    expect(body.memos).toHaveLength(100);

    // 読み取りでは枠が戻らない。まだ上限に達したまま
    expect(
      await takeDailyUsage(db, { userId: USER, count: 1, now: 1_700_000_010_000 }),
    ).toMatchObject({ ok: false });
  });

  it("20件を超える要求は400で、枠を消費しない", async () => {
    const db = createTestDb();

    const tooMany = await importMemosResponse({
      db,
      userId: USER,
      rawBody: Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, i) => `memo ${i}`),
      now: 1_700_000_000_000,
      apiKey: undefined,
      defer: () => {},
    });

    expect(tooMany.status).toBe(400);
    // 解釈で落ちたので、1件分の枠も使っていない（100件すべて残っている）
    expect(
      await takeDailyUsage(db, { userId: USER, count: 100, now: 1_700_000_000_000 }),
    ).toMatchObject({ ok: true, remaining: 0 });
  });
});
