import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMemo } from "@/features/memo/memos";
import { createQuizItem } from "@/features/quiz/quiz-items";
import { getDueItems } from "./review";
import { setTag } from "@/features/tag/tags";
import { createTestDb } from "@/lib/test-db";

/**
 * spec「タグは復習に影響しない」を検査で固定する。
 *
 * タグは探すための機能で、出題の対象・順序・間隔・通知のいずれにも
 * 影響しない。ここが破られると、スケジューラの入力が静かに増える。
 */

const NOW = Date.UTC(2026, 7, 25, 3, 0, 0);
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

describe("復習の取得はタグを知らない", () => {
  const source = readFileSync(join(process.cwd(), "features", "review", "review.ts"), "utf8");

  it("lib/review.ts がタグを import していない", () => {
    // 出題の取得にタグを渡す実装にすると、ここが落ちる
    expect(source).not.toMatch(/["'].*\/tags["']/);
    expect(source).not.toMatch(/\bmemoTags\b/);
    expect(source).not.toMatch(/\btags\b/);
  });

  it("getDueItems の引数にタグが無い", () => {
    const signature = source.slice(
      source.indexOf("export async function getDueItems"),
      source.indexOf("): Promise<DueItem[]>"),
    );
    expect(signature).not.toMatch(/tag/i);
  });
});

describe("タグを付けても復習は変わらない", () => {
  async function dueMemo(db: ReturnType<typeof createTestDb>, content: string) {
    const memo = await createMemo(db, { content, now: NOW - TWO_DAYS, userId: "u1" });
    if (!memo.ok) throw new Error("メモを作れなかった");
    await createQuizItem(db, {
      memoId: memo.memo.id,
      question: `${content}の問`,
      answer: "答",
      now: NOW - TWO_DAYS,
      userId: "u1",
    });
    return memo.memo.id;
  }

  it("タグの有無にかかわらず、その日の対象は全件出る", async () => {
    const db = createTestDb();
    const tagged = await dueMemo(db, "仕事のメモ");
    await dueMemo(db, "タグなしのメモ");

    const before = await getDueItems(db, NOW, "u1");
    await setTag(db, { memoId: tagged, userId: "u1", name: "仕事", now: NOW });
    const after = await getDueItems(db, NOW, "u1");

    expect(before).toHaveLength(2);
    // 絞り込みは一覧の話であって、出題の話ではない
    expect(after.map((i) => i.quizItemId).sort()).toEqual(before.map((i) => i.quizItemId).sort());
  });

  it("タグを付けても次回出題日と段階は変わらない", async () => {
    const db = createTestDb();
    const memoId = await dueMemo(db, "仕事のメモ");

    const { reviewSchedules } = await import("../../db/schema");
    const before = await db.select().from(reviewSchedules);

    await setTag(db, { memoId, userId: "u1", name: "仕事", now: NOW });

    expect(await db.select().from(reviewSchedules)).toEqual(before);
  });
});
