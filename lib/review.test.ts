import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { memos, quizItems, reviewSchedules } from "../db/schema";
import { createMemo, deleteMemo } from "./memos";
import {
  createQuizItem,
  validateQuizItem,
  getReviewStates,
  countUnwritten,
  MAX_QUESTION_LENGTH,
} from "./quiz-items";
import { getDueItems, gradeReview } from "./review";
import { startOfReviewDay } from "./review-scheduler";
import type { AppDb } from "../db/types";

/** テスト用の利用者。認証導入後は userId が必須になった。 */
const USER = "user_a";
const OTHER = "user_b";

const DAY = 24 * 60 * 60 * 1000;
/** 2026-08-23 12:00 JST */
const NOW = Date.UTC(2026, 7, 23, 3, 0, 0);
const later = (n: number) => NOW + n * DAY;

async function seedMemo(db: AppDb, content: string, now = NOW) {
  const r = await createMemo(db, { content, now, userId: USER });
  if (!r.ok) throw new Error("メモの作成に失敗");
  return r.memo;
}

describe("validateQuizItem（タスク 3.1）", () => {
  it("問が空なら拒否する", () => {
    expect(validateQuizItem("  ", "火曜日")).toEqual({ ok: false, error: "empty_question" });
  });

  it("答が空なら拒否する", () => {
    expect(validateQuizItem("定休日は？", "   ")).toEqual({ ok: false, error: "empty_answer" });
  });

  it("両方あれば通り、前後の空白を落とす", () => {
    expect(validateQuizItem(" 定休日は？ ", " 火曜日 ")).toEqual({
      ok: true, question: "定休日は？", answer: "火曜日",
    });
  });

  it("上限を超える問を拒否する", () => {
    const long = "あ".repeat(MAX_QUESTION_LENGTH + 1);
    expect(validateQuizItem(long, "答")).toEqual({ ok: false, error: "too_long" });
  });
});

describe("createQuizItem（タスク 3.1）", () => {
  it("作成すると初回の出題日が1日後になる", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "近所のパン屋は火曜定休");

    const r = await createQuizItem(db, {
      memoId: memo.id, question: "定休日は？", answer: "火曜日", now: NOW, userId: USER });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextReviewAt).toBe(startOfReviewDay(NOW) + DAY);
  });

  it("片方だけでは保存しない", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "本文");

    const r = await createQuizItem(db, {
      memoId: memo.id, question: "問だけ", answer: "", now: NOW, userId: USER });

    expect(r).toEqual({ ok: false, error: "empty_answer" });
    await expect(db.select().from(quizItems)).resolves.toEqual([]);
    await expect(db.select().from(reviewSchedules)).resolves.toEqual([]);
  });

  it("1メモに2つ目の問答は作れない", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "本文");
    await createQuizItem(db, { memoId: memo.id, question: "問", answer: "答", now: NOW, userId: USER });

    const second = await createQuizItem(db, {
      memoId: memo.id, question: "別の問", answer: "別の答", now: NOW, userId: USER });

    expect(second).toEqual({ ok: false, error: "already_exists" });
  });

  it("他人のメモには作れない", async () => {
    const db = createTestDb();
    const r = await createMemo(db, { content: "他人のメモ", now: NOW, userId: OTHER });
    if (!r.ok) throw new Error("失敗");

    const created = await createQuizItem(db, {
      memoId: r.memo.id, question: "問", answer: "答", now: NOW, userId: USER });

    expect(created).toEqual({ ok: false, error: "memo_not_found" });
  });
});

describe("一覧の復習状態（タスク 3.2）", () => {
  it("問答の有無で2つの状態を返す", async () => {
    const db = createTestDb();
    const withQuiz = await seedMemo(db, "問答あり", NOW);
    const without = await seedMemo(db, "問答なし", NOW);
    await createQuizItem(db, { memoId: withQuiz.id, question: "問", answer: "答", now: NOW, userId: USER });

    const states = await getReviewStates(db, USER, Date.now());

    expect(states.get(without.id)).toEqual({ kind: "unwritten" });
    expect(states.get(withQuiz.id)).toEqual({
      kind: "scheduled", nextReviewAt: startOfReviewDay(NOW) + DAY, question: "問",
    });
  });

  it("未作成の件数を数えられる", async () => {
    const db = createTestDb();
    const a = await seedMemo(db, "A");
    await seedMemo(db, "B");
    await seedMemo(db, "C");
    await createQuizItem(db, { memoId: a.id, question: "問", answer: "答", now: NOW, userId: USER });

    await expect(countUnwritten(db, USER, Date.now())).resolves.toBe(2);
  });
});

describe("出題対象（タスク 4.1）", () => {
  async function seedThree(db: AppDb) {
    const due = await seedMemo(db, "期日が来ている");
    const future = await seedMemo(db, "まだ先");
    await seedMemo(db, "問答がない");

    await createQuizItem(db, { memoId: due.id, question: "来てる？", answer: "はい", now: NOW, userId: USER });
    await createQuizItem(db, { memoId: future.id, question: "まだ？", answer: "はい", now: NOW, userId: USER });

    // future だけ遠くへ動かす
    const items = await db.select().from(quizItems);
    const futureItem = items.find((q) => q.memoId === future.id)!;
    await db.update(reviewSchedules)
      .set({ nextReviewAt: startOfReviewDay(NOW) + 30 * DAY })
      .where(eq(reviewSchedules.quizItemId, futureItem.id));
    return { due, future };
  }

  it("期日が来たものだけが対象になる", async () => {
    const db = createTestDb();
    const { due } = await seedThree(db);

    // 翌日になれば due は期日を迎える
    const items = await getDueItems(db, later(1), USER);

    expect(items).toHaveLength(1);
    expect(items[0].memoId).toBe(due.id);
  });

  it("問答のないメモは対象にならない", async () => {
    const db = createTestDb();
    await seedThree(db);

    const items = await getDueItems(db, later(1), USER);

    expect(items.every((i) => i.question.length > 0)).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("期日前は対象にならない", async () => {
    const db = createTestDb();
    await seedThree(db);

    // 作成当日は初回出題日（1日後）に達していない
    await expect(getDueItems(db, NOW, USER)).resolves.toEqual([]);
  });

  it("対象が無いときは空を返す", async () => {
    const db = createTestDb();
    await expect(getDueItems(db, NOW, USER)).resolves.toEqual([]);
  });

  it("他人のメモは対象にならない", async () => {
    const db = createTestDb();
    const mine = await seedMemo(db, "自分の");
    await createQuizItem(db, { memoId: mine.id, question: "問", answer: "答", now: NOW, userId: USER });

    await expect(getDueItems(db, later(1), OTHER)).resolves.toEqual([]);
  });
});

describe("自己採点の記録（タスク 4.2）", () => {
  async function seedDue(db: AppDb) {
    const memo = await seedMemo(db, "近所のパン屋は火曜定休");
    await createQuizItem(db, {
      memoId: memo.id, question: "定休日は？", answer: "火曜日", now: NOW, userId: USER });
    const [item] = await getDueItems(db, later(1), USER);
    return item;
  }

  it("覚えてたを記録すると3日後へ進む", async () => {
    const db = createTestDb();
    const item = await seedDue(db);

    const r = await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).toBe(true);
    expect((r.nextReviewAt - startOfReviewDay(later(1))) / DAY).toBe(3);
  });

  it("忘れてたを記録すると1日後に戻る", async () => {
    const db = createTestDb();
    const item = await seedDue(db);

    const r = await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: false,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.nextReviewAt - startOfReviewDay(later(1))) / DAY).toBe(1);
  });

  it("採点した当日には再び出題されない", async () => {
    const db = createTestDb();
    const item = await seedDue(db);

    await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });

    await expect(getDueItems(db, later(1), USER)).resolves.toEqual([]);
  });
});

describe("記録のべき等性（タスク 4.3・design.md D4）", () => {
  it("同じ出題日で2回送っても1回分しか進まない", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "本文");
    await createQuizItem(db, { memoId: memo.id, question: "問", answer: "答", now: NOW, userId: USER });
    const [item] = await getDueItems(db, later(1), USER);

    const first = await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });
    const second = await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // 2回目は日付を動かさない = 3日後のまま（7日後にならない）
    expect(second.nextReviewAt).toBe(first.nextReviewAt);
    expect((second.nextReviewAt - startOfReviewDay(later(1))) / DAY).toBe(3);
  });

  it("3回送っても同じ", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "本文");
    await createQuizItem(db, { memoId: memo.id, question: "問", answer: "答", now: NOW, userId: USER });
    const [item] = await getDueItems(db, later(1), USER);

    const send = () => gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: USER });
    const a = await send(); const b = await send(); const c = await send();

    expect([a, b, c].every((r) => r.ok)).toBe(true);
    if (!a.ok || !c.ok) return;
    expect(c.nextReviewAt).toBe(a.nextReviewAt);
  });

  it("存在しない問答は not_found を返す", async () => {
    const db = createTestDb();
    const r = await gradeReview(db, {
      quizItemId: "missing", recalled: true, occurrenceAt: 0, now: NOW, userId: USER });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("他人の問答は採点できない", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "自分の");
    await createQuizItem(db, { memoId: memo.id, question: "問", answer: "答", now: NOW, userId: USER });
    const [item] = await getDueItems(db, later(1), USER);

    const r = await gradeReview(db, {
      quizItemId: item.quizItemId, recalled: true,
      occurrenceAt: item.occurrenceAt, now: later(1), userId: OTHER,
    });

    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});

describe("メモの削除", () => {
  it("削除すると出題対象からも外れる", async () => {
    const db = createTestDb();
    const memo = await seedMemo(db, "消される");
    await createQuizItem(db, { memoId: memo.id, question: "問", answer: "答", now: NOW, userId: USER });
    expect(await getDueItems(db, later(1), USER)).toHaveLength(1);

    const r = await deleteMemo(db, { memoId: memo.id, userId: USER });

    expect(r).toEqual({ ok: true });
    await expect(getDueItems(db, later(1), USER)).resolves.toEqual([]);
    await expect(db.select().from(quizItems)).resolves.toEqual([]);
    await expect(db.select().from(reviewSchedules)).resolves.toEqual([]);
  });

  it("他人のメモは削除できない", async () => {
    const db = createTestDb();
    const r = await createMemo(db, { content: "他人の", now: NOW, userId: OTHER });
    if (!r.ok) throw new Error("失敗");

    const deleted = await deleteMemo(db, { memoId: r.memo.id, userId: USER });

    expect(deleted).toEqual({ ok: false, error: "not_found" });
    await expect(db.select().from(memos)).resolves.toHaveLength(1);
  });
});
