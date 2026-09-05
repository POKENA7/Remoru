import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { memos, quizItems, reviewEvents, reviewSchedules } from "../../db/schema";
import { createMemo } from "@/features/memo/memos";
import { createQuizItem } from "@/features/quiz/quiz-items";
import { gradeReview } from "@/features/review/review";
import { createTestDb } from "@/tests/helpers/test-db";

const NOW = Date.UTC(2026, 7, 26, 3, 0, 0);

async function seedItem(db: ReturnType<typeof createTestDb>, userId = "u1", label = "A") {
  const memo = await createMemo(db, { content: `メモ ${label}`, now: NOW, userId });
  if (!memo.ok) throw new Error("メモを作れなかった");
  const quiz = await createQuizItem(db, {
    memoId: memo.memo.id,
    question: `問 ${label}`,
    answer: `答 ${label}`,
    now: NOW,
    userId,
  });
  if (!quiz.ok) throw new Error("問答を作れなかった");
  return { memoId: memo.memo.id, quizItemId: quiz.quizItem.id, nextReviewAt: quiz.nextReviewAt };
}

async function events(db: ReturnType<typeof createTestDb>) {
  return await db.select().from(reviewEvents);
}

describe("想起の記録", () => {
  it("採点すると記録が1件増え、次回出題日も動く", async () => {
    const db = createTestDb();
    const item = await seedItem(db);

    const result = await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u1",
    });

    expect(result.ok && result.applied).toBe(true);
    const rows = await events(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quizItemId: item.quizItemId, recalled: true, occurredAt: NOW });

    const schedules = await db.select().from(reviewSchedules);
    expect(schedules[0].nextReviewAt).not.toBe(item.nextReviewAt);
  });

  it("思い出せなかった採点も残る", async () => {
    const db = createTestDb();
    const item = await seedItem(db);

    await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: false,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u1",
    });

    expect((await events(db))[0].recalled).toBe(false);
  });

  it("同じ採点が二度届いても記録は1件のまま", async () => {
    const db = createTestDb();
    const item = await seedItem(db);

    // 二重送信。べき等の判定は occurrenceAt の比較で行っており、
    // 記録側では見ていない（design.md D4）
    await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u1",
    });
    const second = await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW + 1000,
      userId: "u1",
    });

    expect(second.ok && second.applied).toBe(false);
    expect(await events(db)).toHaveLength(1);
  });

  it("他人の問答は採点できず、記録も残らない", async () => {
    const db = createTestDb();
    const item = await seedItem(db, "u1");

    const result = await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u2",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(await events(db)).toHaveLength(0);
  });

  it("問答を消すと記録も消える", async () => {
    const db = createTestDb();
    const item = await seedItem(db);
    await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u1",
    });

    await db.delete(quizItems).where(eq(quizItems.id, item.quizItemId));
    expect(await events(db)).toHaveLength(0);
  });

  it("メモを消すと、問答を通じて記録も消える", async () => {
    const db = createTestDb();
    const item = await seedItem(db);
    await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: true,
      occurrenceAt: item.nextReviewAt,
      now: NOW,
      userId: "u1",
    });

    await db.delete(memos).where(eq(memos.id, item.memoId));
    expect(await events(db)).toHaveLength(0);
  });
});

describe("累計", () => {
  async function grade(
    db: ReturnType<typeof createTestDb>,
    item: { quizItemId: string },
    recalled: boolean,
    now: number,
    userId = "u1",
  ) {
    const rows = await db
      .select({ nextReviewAt: reviewSchedules.nextReviewAt })
      .from(reviewSchedules)
      .where(eq(reviewSchedules.quizItemId, item.quizItemId));
    return await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled,
      occurrenceAt: rows[0].nextReviewAt,
      now,
      userId,
    });
  }

  it("思い出せた回数だけを数える", async () => {
    const { totalRecalled } = await import("./learning-record");
    const db = createTestDb();
    const item = await seedItem(db);

    await grade(db, item, true, NOW);
    await grade(db, item, false, NOW + 5 * 24 * 3600_000);
    await grade(db, item, true, NOW + 10 * 24 * 3600_000);

    expect(await totalRecalled(db, "u1")).toBe(2);
  });

  it("**忘れても累計は減らない**", async () => {
    const { totalRecalled } = await import("./learning-record");
    const db = createTestDb();
    const item = await seedItem(db);

    await grade(db, item, true, NOW);
    const before = await totalRecalled(db, "u1");

    // 段階が下がる採点をしても、過去に思い出せた事実は変わらない
    await grade(db, item, false, NOW + 5 * 24 * 3600_000);

    expect(await totalRecalled(db, "u1")).toBe(before);
  });

  it("他人の記録は混ざらない", async () => {
    const { totalRecalled } = await import("./learning-record");
    const db = createTestDb();
    const mine = await seedItem(db, "u1", "A");
    const theirs = await seedItem(db, "u2", "B");

    await grade(db, mine, true, NOW);
    await grade(db, theirs, true, NOW, "u2");

    expect(await totalRecalled(db, "u1")).toBe(1);
    expect(await totalRecalled(db, "u2")).toBe(1);
  });

  it("一度も復習していなければ0", async () => {
    const { totalRecalled } = await import("./learning-record");
    const db = createTestDb();
    await seedItem(db);
    expect(await totalRecalled(db, "u1")).toBe(0);
  });
});

describe("いま持っているもの", () => {
  async function advance(
    db: ReturnType<typeof createTestDb>,
    item: { quizItemId: string },
    times: number,
  ) {
    let now = NOW;
    for (let i = 0; i < times; i++) {
      const rows = await db
        .select({ nextReviewAt: reviewSchedules.nextReviewAt })
        .from(reviewSchedules)
        .where(eq(reviewSchedules.quizItemId, item.quizItemId));
      now = rows[0].nextReviewAt;
      await gradeReview(db, {
        quizItemId: item.quizItemId,
        recalled: true,
        occurrenceAt: rows[0].nextReviewAt,
        now,
        userId: "u1",
      });
    }
  }

  it("段階が進むと上の層に入る（累積）", async () => {
    const { retentionLayers } = await import("./learning-record");
    const db = createTestDb();
    const item = await seedItem(db);

    // 間隔は [1, 3, 7, 14, 30] 日
    expect(await retentionLayers(db, "u1")).toEqual([
      { label: "1週間以上", count: 0 },
      { label: "1か月以上", count: 0 },
    ]);

    await advance(db, item, 2); // → 7日
    expect((await retentionLayers(db, "u1"))[0]).toEqual({ label: "1週間以上", count: 1 });

    await advance(db, item, 2); // → 30日。1週間以上にも入ったまま
    expect(await retentionLayers(db, "u1")).toEqual([
      { label: "1週間以上", count: 1 },
      { label: "1か月以上", count: 1 },
    ]);
  });

  it("忘れると下の層に落ちる（層は減りうる）", async () => {
    const { retentionLayers } = await import("./learning-record");
    const db = createTestDb();
    const item = await seedItem(db);
    await advance(db, item, 4);
    expect((await retentionLayers(db, "u1"))[1].count).toBe(1);

    const rows = await db
      .select({ nextReviewAt: reviewSchedules.nextReviewAt })
      .from(reviewSchedules)
      .where(eq(reviewSchedules.quizItemId, item.quizItemId));
    await gradeReview(db, {
      quizItemId: item.quizItemId,
      recalled: false,
      occurrenceAt: rows[0].nextReviewAt,
      now: rows[0].nextReviewAt,
      userId: "u1",
    });

    expect(await retentionLayers(db, "u1")).toEqual([
      { label: "1週間以上", count: 0 },
      { label: "1か月以上", count: 0 },
    ]);
  });

  it("問答を持たないメモは数に入らない", async () => {
    const { retentionLayers } = await import("./learning-record");
    const db = createTestDb();
    await createMemo(db, { content: "問答なし", now: NOW, userId: "u1" });

    expect(await retentionLayers(db, "u1")).toEqual([
      { label: "1週間以上", count: 0 },
      { label: "1か月以上", count: 0 },
    ]);
  });

  it("他人の問答は数に入らない", async () => {
    const { retentionLayers } = await import("./learning-record");
    const db = createTestDb();
    const theirs = await seedItem(db, "u2", "B");

    // **相手の問答を層に入る段階まで進める。** 進めないと、絞り込みが
    // 効いていなくても0のままで、検査として何も見ていないことになる
    let now = NOW;
    for (let i = 0; i < 4; i++) {
      const rows = await db
        .select({ nextReviewAt: reviewSchedules.nextReviewAt })
        .from(reviewSchedules)
        .where(eq(reviewSchedules.quizItemId, theirs.quizItemId));
      now = rows[0].nextReviewAt;
      await gradeReview(db, {
        quizItemId: theirs.quizItemId,
        recalled: true,
        occurrenceAt: rows[0].nextReviewAt,
        now,
        userId: "u2",
      });
    }

    expect((await retentionLayers(db, "u2"))[1]).toEqual({ label: "1か月以上", count: 1 });
    expect((await retentionLayers(db, "u1")).every((l) => l.count === 0)).toBe(true);
  });

  it("**記録の無い問答は数えない**（作成日を起点にしない）", async () => {
    const { retentionLayers } = await import("./learning-record");
    const db = createTestDb();
    const old = NOW - 60 * 24 * 3600_000;

    // review_events は change 10 で作った表なので、それ以前の問答は
    // 採点済みでも記録が無い。作成日を起点にすると「問答の古さ」を測る
    const memo = await createMemo(db, { content: "古いメモ", now: old, userId: "u1" });
    if (!memo.ok) throw new Error("メモを作れなかった");
    const quiz = await createQuizItem(db, {
      memoId: memo.memo.id,
      question: "問",
      answer: "答",
      now: old,
      userId: "u1",
    });
    if (!quiz.ok) throw new Error("問答を作れなかった");
    // いま「忘れてた」を押した状態＝次回は明日
    await db
      .update(reviewSchedules)
      .set({ nextReviewAt: NOW + 24 * 3600_000 })
      .where(eq(reviewSchedules.quizItemId, quiz.quizItem.id));

    expect(await retentionLayers(db, "u1")).toEqual([
      { label: "1週間以上", count: 0 },
      { label: "1か月以上", count: 0 },
    ]);
  });
});

describe("スケジューラの内部状態を読んでいない", () => {
  it("lib/learning-record.ts が state を読んでいない", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "features", "record", "learning-record.ts"),
      "utf8",
    );

    // review-scheduling の spec: 外部から観測できるのは次回出題日のみ
    expect(src).not.toMatch(/reviewSchedules\.state/);
    expect(src).not.toMatch(/parseState/);
    expect(src).not.toMatch(/\bstage\b/);
  });
});
