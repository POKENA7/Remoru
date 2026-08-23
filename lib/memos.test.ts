import { describe, it, expect } from "vitest";
import { createTestDb } from "./test-db";
import {
  validateMemoContent,
  createMemo,
  listMemos,
  MAX_CONTENT_LENGTH,
} from "./memos";

/** テスト用の利用者。認証導入後は userId が必須になった。 */
const USER = "user_a";
const OTHER = "user_b";

describe("validateMemoContent", () => {
  // spec: Scenario「空のメモを拒否する」
  it("空文字を拒否する", () => {
    expect(validateMemoContent("")).toEqual({ ok: false, error: "empty" });
  });

  it("空白文字のみを拒否する", () => {
    expect(validateMemoContent("   \n\t 　")).toEqual({
      ok: false,
      error: "empty",
    });
  });

  // spec: Scenario「上限を超えるメモを拒否する」
  it(`${MAX_CONTENT_LENGTH}文字ちょうどは受け付ける`, () => {
    const content = "あ".repeat(MAX_CONTENT_LENGTH);
    expect(validateMemoContent(content)).toEqual({ ok: true, content });
  });

  it(`${MAX_CONTENT_LENGTH}文字を超えると拒否する`, () => {
    const content = "あ".repeat(MAX_CONTENT_LENGTH + 1);
    expect(validateMemoContent(content)).toEqual({
      ok: false,
      error: "too_long",
    });
  });

  it("絵文字を1文字として数える", () => {
    const content = "😀".repeat(MAX_CONTENT_LENGTH);
    expect(validateMemoContent(content).ok).toBe(true);
  });

  it("前後の空白を除去した本文を返す", () => {
    expect(validateMemoContent("  近所のパン屋は火曜定休  ")).toEqual({
      ok: true,
      content: "近所のパン屋は火曜定休",
    });
  });
});

describe("createMemo", () => {
  // spec: Scenario「メモを保存する」
  it("メモを保存し、保存時刻を記録する", async () => {
    const db = createTestDb();

    const result = await createMemo(db, {
      content: "近所のパン屋は火曜定休",
      now: 1_700_000_000_000, userId: USER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memo.content).toBe("近所のパン屋は火曜定休");
    expect(result.memo.createdAt).toBe(1_700_000_000_000);

    const stored = await listMemos(db, USER);
    expect(stored).toHaveLength(1);
    expect(stored[0].createdAt).toBe(1_700_000_000_000);
  });

  it("前後の空白を除去して保存する", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "  余白あり  ", now: 1, userId: USER });

    const stored = await listMemos(db, USER);
    expect(stored[0].content).toBe("余白あり");
  });

  it("検証に失敗したメモは保存しない", async () => {
    const db = createTestDb();

    const result = await createMemo(db, { content: "   ", now: 1, userId: USER });

    expect(result).toEqual({ ok: false, error: "empty" });
    await expect(listMemos(db, USER)).resolves.toEqual([]);
  });

  it("上限を超えるメモは保存しない", async () => {
    const db = createTestDb();

    const result = await createMemo(db, {
      content: "あ".repeat(MAX_CONTENT_LENGTH + 1),
      now: 1, userId: USER });

    expect(result).toEqual({ ok: false, error: "too_long" });
    await expect(listMemos(db, USER)).resolves.toEqual([]);
  });

  it("メモごとに異なる識別子を割り当てる", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "A", now: 1, userId: USER });
    await createMemo(db, { content: "B", now: 2, userId: USER });

    const stored = await listMemos(db, USER);
    expect(new Set(stored.map((m) => m.id)).size).toBe(2);
  });
});

describe("listMemos", () => {
  // spec: Scenario「メモが1件もない場合」
  it("メモがないとき空の配列を返す", async () => {
    const db = createTestDb();
    await expect(listMemos(db, USER)).resolves.toEqual([]);
  });

  // spec: Scenario「複数のメモを新しい順に表示する」
  it("保存時刻の新しい順に返す", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "古い", now: 1_000, userId: USER });
    await createMemo(db, { content: "最新", now: 3_000, userId: USER });
    await createMemo(db, { content: "中間", now: 2_000, userId: USER });

    const stored = await listMemos(db, USER);
    expect(stored.map((m) => m.content)).toEqual(["最新", "中間", "古い"]);
  });

  // spec: Scenario「投入したメモが即座に一覧に現れる」のデータ側
  it("保存直後のメモが先頭に含まれる", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "既存", now: 1_000, userId: USER });

    await createMemo(db, { content: "たった今", now: 2_000, userId: USER });

    const stored = await listMemos(db, USER);
    expect(stored[0].content).toBe("たった今");
  });

  it("他の利用者のメモを含まない", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "自分のメモ", now: 1_000, userId: USER });
    await createMemo(db, {
      content: "他人のメモ",
      now: 2_000,
      userId: OTHER,
    });

    const stored = await listMemos(db, USER);
    expect(stored.map((m) => m.content)).toEqual(["自分のメモ"]);
  });
});
