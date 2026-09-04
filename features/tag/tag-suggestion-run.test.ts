import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoTags, tags } from "../../db/schema";
import { createMemo } from "@/features/memo/memos";
import { SUGGEST_TOOL_NAME, SUGGESTION_THRESHOLD } from "./tag-suggestion";
import type { CallModel } from "./tag-suggestion-client";
import {
  applyAssignments,
  dismissSuggestion,
  listUntaggedMemos,
  proposeTags,
  suggestionStatus,
} from "./tag-suggestion-run";
import { getTagsForMemos, setTag } from "./tags";
import { createTestDb } from "@/lib/test-db";

const NOW = Date.UTC(2026, 7, 25, 3, 0, 0);

function toolResponse(assignments: unknown) {
  return { content: [{ type: "tool_use", name: SUGGEST_TOOL_NAME, input: { assignments } }] };
}

async function seedMemos(db: ReturnType<typeof createTestDb>, n: number, userId = "u1") {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = await createMemo(db, { content: `メモ${i}`, now: NOW + i, userId });
    if (!m.ok) throw new Error("メモを作れなかった");
    ids.push(m.memo.id);
  }
  return ids;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("提案の対象", () => {
  it("タグを持たないメモだけを拾う", async () => {
    const db = createTestDb();
    const [a, b] = await seedMemos(db, 2);
    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });

    expect((await listUntaggedMemos(db, "u1")).map((m) => m.id)).toEqual([b]);
  });

  it("他人の未分類は拾わない", async () => {
    const db = createTestDb();
    await seedMemos(db, 2, "u1");
    await seedMemos(db, 3, "u2");

    expect(await listUntaggedMemos(db, "u1")).toHaveLength(2);
  });
});

describe("提案を出すか", () => {
  it("たまるまで出さない", async () => {
    const db = createTestDb();
    await seedMemos(db, SUGGESTION_THRESHOLD - 1);
    expect((await suggestionStatus(db, "u1")).show).toBe(false);

    await seedMemos(db, 1);
    expect((await suggestionStatus(db, "u1")).show).toBe(true);
  });

  it("断ると、次にたまるまで出さない", async () => {
    const db = createTestDb();
    await seedMemos(db, SUGGESTION_THRESHOLD);
    await dismissSuggestion(db, { userId: "u1", now: NOW });

    expect((await suggestionStatus(db, "u1")).show).toBe(false);

    // もう一段たまれば、また出る
    await seedMemos(db, SUGGESTION_THRESHOLD);
    expect((await suggestionStatus(db, "u1")).show).toBe(true);
  });

  it("断った記録は利用者ごと", async () => {
    const db = createTestDb();
    await seedMemos(db, SUGGESTION_THRESHOLD, "u1");
    await seedMemos(db, SUGGESTION_THRESHOLD, "u2");
    await dismissSuggestion(db, { userId: "u1", now: NOW });

    expect((await suggestionStatus(db, "u1")).show).toBe(false);
    expect((await suggestionStatus(db, "u2")).show).toBe(true);
  });
});

describe("提案の実行", () => {
  it("既存のタグ名を入力に渡す", async () => {
    const db = createTestDb();
    const [a, b] = await seedMemos(db, 2);
    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });

    const seen: unknown[] = [];
    const call: CallModel = async (input) => {
      seen.push(input);
      return toolResponse([{ memoId: b, tag: "読書" }]);
    };

    await proposeTags(db, { userId: "u1", apiKey: "key", call });

    // 乱立を防ぐため、すでに使っている名前を渡す（design.md D8）
    expect(JSON.stringify(seen[0])).toContain("仕事");
  });

  it("提案しただけでは書き込まない", async () => {
    const db = createTestDb();
    const [a] = await seedMemos(db, 1);
    const call: CallModel = async () => toolResponse([{ memoId: a, tag: "仕事" }]);

    const result = await proposeTags(db, { userId: "u1", apiKey: "key", call });

    expect(result.ok).toBe(true);
    // 承認されるまでタグは付かない
    expect(await db.select().from(memoTags)).toHaveLength(0);
  });

  it("承認に出すのはタグ名と件数だけ", async () => {
    const db = createTestDb();
    const [a, b] = await seedMemos(db, 2);
    const call: CallModel = async () =>
      toolResponse([
        { memoId: a, tag: "仕事" },
        { memoId: b, tag: "仕事" },
      ]);

    const result = await proposeTags(db, { userId: "u1", apiKey: "key", call });

    expect(result.ok && result.summary).toEqual([{ tag: "仕事", count: 2 }]);
    expect(result.ok && JSON.stringify(result.summary)).not.toContain(a);
  });

  it("鍵が無ければ提案しない", async () => {
    const db = createTestDb();
    await seedMemos(db, 2);
    expect(await proposeTags(db, { userId: "u1", apiKey: undefined })).toEqual({
      ok: false,
      reason: "no_key",
    });
  });
});

describe("提案の受け入れ", () => {
  it("提案どおりにタグが付く", async () => {
    const db = createTestDb();
    const [a, b] = await seedMemos(db, 2);

    const result = await applyAssignments(db, {
      userId: "u1",
      assignments: [
        { memoId: a, tag: "仕事" },
        { memoId: b, tag: "読書" },
      ],
      now: NOW,
    });

    expect(result).toEqual({ applied: 2, skipped: 0 });
    const byMemo = await getTagsForMemos(db, "u1");
    expect(byMemo.get(a)?.map((t) => t.name)).toEqual(["仕事"]);
    expect(byMemo.get(b)?.map((t) => t.name)).toEqual(["読書"]);
  });

  it("知らないメモの id が混ざっていても、残りは付く", async () => {
    const db = createTestDb();
    const [a] = await seedMemos(db, 1);

    const result = await applyAssignments(db, {
      userId: "u1",
      assignments: [
        { memoId: "存在しない", tag: "のっとり" },
        { memoId: a, tag: "仕事" },
      ],
      now: NOW,
    });

    expect(result).toEqual({ applied: 1, skipped: 1 });
    expect((await getTagsForMemos(db, "u1")).get(a)?.map((t) => t.name)).toEqual(["仕事"]);
  });

  it("他人のメモには付かない", async () => {
    const db = createTestDb();
    const [theirs] = await seedMemos(db, 1, "u2");

    const result = await applyAssignments(db, {
      userId: "u1",
      assignments: [{ memoId: theirs, tag: "のっとり" }],
      now: NOW,
    });

    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect(await db.select().from(memoTags)).toHaveLength(0);
  });

  it("受け入れても1メモ1タグは守られる", async () => {
    const db = createTestDb();
    const [a] = await seedMemos(db, 1);
    await setTag(db, { memoId: a, userId: "u1", name: "もとのタグ", now: NOW });

    await applyAssignments(db, {
      userId: "u1",
      assignments: [{ memoId: a, tag: "あたらしいタグ" }],
      now: NOW + 1000,
    });

    // setTag を通しているので、差し替えの規則がそのまま効く
    expect((await getTagsForMemos(db, "u1")).get(a)).toHaveLength(1);
  });
});

describe("提案の失敗", () => {
  it("失敗しても既存のタグは変わらない", async () => {
    const db = createTestDb();
    const [a, b] = await seedMemos(db, 2);
    await setTag(db, { memoId: a, userId: "u1", name: "仕事", now: NOW });

    const before = await db.select().from(memoTags);
    const call: CallModel = async () => {
      throw new Error("500");
    };

    expect(await proposeTags(db, { userId: "u1", apiKey: "key", call })).toEqual({
      ok: false,
      reason: "request_failed",
    });
    expect(await db.select().from(memoTags)).toEqual(before);
    expect(await db.select().from(tags)).toHaveLength(1);
    expect(b).toBeTruthy();
  });
});

describe("提案の契機はサーバー側でも見る", () => {
  it("未分類が無ければモデルを呼ばない", async () => {
    const db = createTestDb();
    const calls: unknown[] = [];
    const call: CallModel = async (input) => {
      calls.push(input);
      return toolResponse([]);
    };

    expect(await proposeTags(db, { userId: "u1", apiKey: "key", call })).toEqual({
      ok: true,
      assignments: [],
      summary: [],
    });
    // 呼び出し1回がそのまま課金になるので、対象が無いときは出さない
    expect(calls).toEqual([]);
  });
});

describe("受け入れで同じメモに2つ来ても", () => {
  it("1メモ1タグは守られる", async () => {
    const db = createTestDb();
    const [a] = await seedMemos(db, 1);

    // 同じ now が全件に渡るので、memo_tags の createdAt が同値になる
    await applyAssignments(db, {
      userId: "u1",
      assignments: [
        { memoId: a, tag: "さいしょ" },
        { memoId: a, tag: "あと" },
      ],
      now: NOW,
    });

    expect((await getTagsForMemos(db, "u1")).get(a)).toHaveLength(1);
  });
});
