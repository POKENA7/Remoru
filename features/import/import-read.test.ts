import { describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { createMemo } from "@/features/memo/memos";
import { createQuizItem } from "@/features/quiz/quiz-items";
import { setTag } from "@/features/tag/tags";
import { getMemoForApi, listMemosForApi, listTagsForApi } from "./import-read";

/** テスト用の利用者。 */
const USER = "user_a";
const OTHER = "user_b";

const NOW = 1_700_000_000_000;

describe("listMemosForApi", () => {
  it("新しい順に返し、持ち主の識別子を含めない", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "古い", now: 1, userId: USER });
    await createMemo(db, { content: "新しい", now: 2, userId: USER });
    await createMemo(db, { content: "他人", now: 3, userId: OTHER });

    const rows = await listMemosForApi(db, { userId: USER, now: NOW });

    expect(rows.map((r) => r.content)).toEqual(["新しい", "古い"]);
    expect(rows.some((r) => "userId" in r)).toBe(false);
  });

  it("件数の上限を守る", async () => {
    const db = createTestDb();
    await createMemo(db, { content: "1", now: 1, userId: USER });
    await createMemo(db, { content: "2", now: 2, userId: USER });
    await createMemo(db, { content: "3", now: 3, userId: USER });

    const rows = await listMemosForApi(db, { userId: USER, now: NOW, limit: 2 });
    expect(rows.map((r) => r.content)).toEqual(["3", "2"]);
  });

  it("タグで絞り込む", async () => {
    const db = createTestDb();
    const tagged = await createMemo(db, { content: "タグあり", now: 1, userId: USER });
    await createMemo(db, { content: "タグなし", now: 2, userId: USER });
    if (!tagged.ok) throw new Error("保存できなかった");
    const tag = await setTag(db, { memoId: tagged.memo.id, userId: USER, name: "店", now: 1 });
    if (!tag.ok) throw new Error("タグを付けられなかった");

    const rows = await listMemosForApi(db, { userId: USER, now: NOW, tagId: tag.tag.id });
    expect(rows.map((r) => r.content)).toEqual(["タグあり"]);
  });

  it("問答があれば復習の状態を含める", async () => {
    const db = createTestDb();
    const created = await createMemo(db, { content: "復習する", now: 1, userId: USER });
    if (!created.ok) throw new Error("保存できなかった");
    await createQuizItem(db, {
      memoId: created.memo.id,
      question: "定休日は？",
      answer: "火曜",
      now: NOW,
      userId: USER,
    });

    const [row] = await listMemosForApi(db, { userId: USER, now: NOW });
    expect(row.review).toMatchObject({ kind: "scheduled", question: "定休日は？" });
  });

  it("タグを本文とあわせて返す", async () => {
    const db = createTestDb();
    const created = await createMemo(db, { content: "タグつき", now: 1, userId: USER });
    if (!created.ok) throw new Error("保存できなかった");
    await setTag(db, { memoId: created.memo.id, userId: USER, name: "店", now: 1 });

    const [row] = await listMemosForApi(db, { userId: USER, now: NOW });
    expect(row.tags.map((t) => t.name)).toEqual(["店"]);
  });
});

describe("getMemoForApi", () => {
  it("本文とタグと問答と次回出題日を返す", async () => {
    const db = createTestDb();
    const created = await createMemo(db, { content: "詳細", now: 1, userId: USER });
    if (!created.ok) throw new Error("保存できなかった");
    const quiz = await createQuizItem(db, {
      memoId: created.memo.id,
      question: "定休日は？",
      answer: "火曜",
      now: NOW,
      userId: USER,
    });
    if (!quiz.ok) throw new Error("問答を作れなかった");

    const detail = await getMemoForApi(db, { userId: USER, memoId: created.memo.id, now: NOW });
    expect(detail).toMatchObject({
      content: "詳細",
      answer: "火曜",
      review: { kind: "scheduled", nextReviewAt: quiz.nextReviewAt, question: "定休日は？" },
    });
  });

  it("問答が無ければ答えは null", async () => {
    const db = createTestDb();
    const created = await createMemo(db, { content: "未作成", now: 1, userId: USER });
    if (!created.ok) throw new Error("保存できなかった");

    const detail = await getMemoForApi(db, { userId: USER, memoId: created.memo.id, now: NOW });
    expect(detail).toMatchObject({ answer: null, review: { kind: "unwritten" } });
  });

  // spec: Scenario「他人のメモの詳細は無いものとして応答する」
  it("他人のメモは null", async () => {
    const db = createTestDb();
    const created = await createMemo(db, { content: "他人のメモ", now: 1, userId: OTHER });
    if (!created.ok) throw new Error("保存できなかった");

    expect(await getMemoForApi(db, { userId: USER, memoId: created.memo.id, now: NOW })).toBeNull();
  });
});

describe("listTagsForApi", () => {
  it("自分のタグだけを名前順に返す", async () => {
    const db = createTestDb();
    const mine = await createMemo(db, { content: "自分", now: 1, userId: USER });
    const theirs = await createMemo(db, { content: "他人", now: 2, userId: OTHER });
    if (!mine.ok || !theirs.ok) throw new Error("保存できなかった");
    await setTag(db, { memoId: mine.memo.id, userId: USER, name: "店", now: 1 });
    await setTag(db, { memoId: theirs.memo.id, userId: OTHER, name: "他人のタグ", now: 2 });

    const rows = await listTagsForApi(db, USER);
    expect(rows).toEqual([{ id: expect.any(String), name: "店", count: 1 }]);
  });
});
