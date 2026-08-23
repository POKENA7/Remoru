import { describe, it, expect } from "vitest";
import { createTestDb } from "./test-db";
import { createMemo, listMemos, deleteMemo } from "./memos";
import { createQuizItem, getReviewStates, countUnwritten } from "./quiz-items";
import { getDueItems, gradeReview } from "./review";
import type { AppDb } from "../db/types";

/**
 * 利用者ごとの分離（design.md D5）。
 *
 * 「気をつける」では守れないので、2人分のデータを用意して境界を検査する。
 * 認証が入っても、データ層が持ち主で絞れていなければ意味がない。
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 23, 3, 0, 0);
const A = "user_a";
const B = "user_b";

/** A と B にそれぞれメモ＋問答を1件ずつ用意する */
async function seedBoth(db: AppDb) {
  const ids: Record<string, string> = {};
  for (const [user, content, q, a] of [
    [A, "Aのメモ", "Aの問", "Aの答"],
    [B, "Bのメモ", "Bの問", "Bの答"],
  ] as const) {
    const m = await createMemo(db, { content, now: NOW, userId: user });
    if (!m.ok) throw new Error("失敗");
    ids[user] = m.memo.id;
    await createQuizItem(db, {
      memoId: m.memo.id, question: q, answer: a, now: NOW, userId: user,
    });
  }
  return ids;
}

describe("メモの分離（タスク 4.1）", () => {
  it("一覧に他人のメモが出ない", async () => {
    const db = createTestDb();
    await seedBoth(db);

    const forA = await listMemos(db, A);
    const forB = await listMemos(db, B);

    expect(forA.map((m) => m.content)).toEqual(["Aのメモ"]);
    expect(forB.map((m) => m.content)).toEqual(["Bのメモ"]);
  });

  it("他人のメモは削除できない", async () => {
    const db = createTestDb();
    const ids = await seedBoth(db);

    const result = await deleteMemo(db, { memoId: ids[B], userId: A });

    expect(result).toEqual({ ok: false, error: "not_found" });
    await expect(listMemos(db, B)).resolves.toHaveLength(1);
  });

  it("自分のメモは削除できる", async () => {
    const db = createTestDb();
    const ids = await seedBoth(db);

    await deleteMemo(db, { memoId: ids[A], userId: A });

    await expect(listMemos(db, A)).resolves.toEqual([]);
    await expect(listMemos(db, B)).resolves.toHaveLength(1);
  });
});

describe("問答の分離（タスク 4.2）", () => {
  it("他人のメモには問答を作れない", async () => {
    const db = createTestDb();
    const m = await createMemo(db, { content: "Bのメモ", now: NOW, userId: B });
    if (!m.ok) throw new Error("失敗");

    const result = await createQuizItem(db, {
      memoId: m.memo.id, question: "横取り", answer: "する", now: NOW, userId: A,
    });

    expect(result).toEqual({ ok: false, error: "memo_not_found" });
  });

  it("復習状態に他人の分が混ざらない", async () => {
    const db = createTestDb();
    const ids = await seedBoth(db);

    const states = await getReviewStates(db, A);

    expect([...states.keys()]).toEqual([ids[A]]);
    expect(states.has(ids[B])).toBe(false);
  });

  it("未作成の件数に他人の分が混ざらない", async () => {
    const db = createTestDb();
    await seedBoth(db);
    // B だけ問答なしのメモを増やす
    await createMemo(db, { content: "Bの未作成", now: NOW, userId: B });

    await expect(countUnwritten(db, A)).resolves.toBe(0);
    await expect(countUnwritten(db, B)).resolves.toBe(1);
  });
});

describe("復習の分離（タスク 4.3）", () => {
  it("出題対象に他人の問答が混ざらない", async () => {
    const db = createTestDb();
    await seedBoth(db);

    const forA = await getDueItems(db, NOW + DAY, A);
    const forB = await getDueItems(db, NOW + DAY, B);

    expect(forA.map((i) => i.question)).toEqual(["Aの問"]);
    expect(forB.map((i) => i.question)).toEqual(["Bの問"]);
  });

  it("他人の問答は採点できず、相手の次回出題日も変わらない", async () => {
    const db = createTestDb();
    await seedBoth(db);
    const [itemB] = await getDueItems(db, NOW + DAY, B);
    const before = itemB.occurrenceAt;

    const result = await gradeReview(db, {
      quizItemId: itemB.quizItemId, recalled: true,
      occurrenceAt: before, now: NOW + DAY, userId: A,
    });

    expect(result).toEqual({ ok: false, error: "not_found" });

    // B から見て、期日も出題対象も動いていない
    const [stillDue] = await getDueItems(db, NOW + DAY, B);
    expect(stillDue.occurrenceAt).toBe(before);
  });

  it("自分の問答は採点でき、相手には影響しない", async () => {
    const db = createTestDb();
    await seedBoth(db);
    const [itemA] = await getDueItems(db, NOW + DAY, A);
    const [itemB] = await getDueItems(db, NOW + DAY, B);

    await gradeReview(db, {
      quizItemId: itemA.quizItemId, recalled: true,
      occurrenceAt: itemA.occurrenceAt, now: NOW + DAY, userId: A,
    });

    await expect(getDueItems(db, NOW + DAY, A)).resolves.toEqual([]);
    const [afterB] = await getDueItems(db, NOW + DAY, B);
    expect(afterB.occurrenceAt).toBe(itemB.occurrenceAt);
  });
});
