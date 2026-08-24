import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { memos } from "../db/schema";
import { createMemo } from "./memos";
import { countUnwritten, createQuizItem, getReviewStates } from "./quiz-items";
import { GENERATION_TIMEOUT_MS, isGenerating } from "./quiz-generation";

const NOW = Date.UTC(2026, 7, 24, 3, 0, 0);

async function memoWithPending(db: ReturnType<typeof createTestDb>, pending: number | null) {
  const created = await createMemo(db, { content: "近所のパン屋は火曜定休", now: NOW, userId: "u1" });
  if (!created.ok) throw new Error("メモを作れなかった");
  await db
    .update(memos)
    .set({ quizPendingSince: pending })
    .where(eq(memos.id, created.memo.id));
  return created.memo.id;
}

describe("生成中かどうか", () => {
  it("始めていなければ生成中ではない", () => {
    expect(isGenerating(null, NOW)).toBe(false);
  });

  it("始めた直後は生成中", () => {
    expect(isGenerating(NOW, NOW)).toBe(true);
    expect(isGenerating(NOW - 1000, NOW)).toBe(true);
  });

  it("上限を過ぎたら生成中ではない", () => {
    // 応答後の実行は打ち切られうる。永久に作成中のまま留まるメモを作らない。
    expect(isGenerating(NOW - GENERATION_TIMEOUT_MS, NOW)).toBe(false);
    expect(isGenerating(NOW - GENERATION_TIMEOUT_MS - 1, NOW)).toBe(false);
  });
});

describe("一覧の状態", () => {
  it("既存のメモ（列が空）は未作成として読める", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, null);

    const states = await getReviewStates(db, "u1", NOW);
    expect(states.get(id)).toEqual({ kind: "unwritten" });
  });

  it("生成中のメモは作成中になる", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, NOW - 1000);

    expect(await getReviewStates(db, "u1", NOW)).toEqual(
      new Map([[id, { kind: "generating" }]]),
    );
  });

  it("上限を過ぎた作成中は未作成に落ちる", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, NOW - GENERATION_TIMEOUT_MS - 1);

    expect(await getReviewStates(db, "u1", NOW)).toEqual(
      new Map([[id, { kind: "unwritten" }]]),
    );
  });

  it("問答があれば、生成中の印が残っていても作成済みが勝つ", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, NOW - 1000);
    await createQuizItem(db, {
      memoId: id, question: "定休日は？", answer: "火曜", now: NOW, userId: "u1",
    });

    const states = await getReviewStates(db, "u1", NOW);
    expect(states.get(id)?.kind).toBe("scheduled");
  });

  it("一覧には問だけを載せ、答えは載せない", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, null);
    await createQuizItem(db, {
      memoId: id, question: "定休日は？", answer: "火曜", now: NOW, userId: "u1",
    });

    const state = (await getReviewStates(db, "u1", NOW)).get(id);
    // 答えが一覧に出ると、開くだけで想起の機会が失われる
    expect(JSON.stringify(state)).toContain("定休日は？");
    expect(JSON.stringify(state)).not.toContain("火曜");
  });

  it("3つの状態が混ざっても、それぞれに分類される", async () => {
    const db = createTestDb();
    const done = await memoWithPending(db, null);
    await createQuizItem(db, {
      memoId: done, question: "問", answer: "答", now: NOW, userId: "u1",
    });
    const generating = await memoWithPending(db, NOW - 1000);
    const unwritten = await memoWithPending(db, null);

    const states = await getReviewStates(db, "u1", NOW);
    expect(states.get(done)?.kind).toBe("scheduled");
    expect(states.get(generating)?.kind).toBe("generating");
    expect(states.get(unwritten)?.kind).toBe("unwritten");
  });
});

describe("未作成の件数", () => {
  it("生成中のメモは数に含めない", async () => {
    const db = createTestDb();
    await memoWithPending(db, NOW - 1000);
    await memoWithPending(db, null);

    // 待っているだけの利用者に「手で書け」と催促しない
    expect(await countUnwritten(db, "u1", NOW)).toBe(1);
  });

  it("上限を過ぎた作成中は数に含める", async () => {
    const db = createTestDb();
    await memoWithPending(db, NOW - GENERATION_TIMEOUT_MS - 1);

    expect(await countUnwritten(db, "u1", NOW)).toBe(1);
  });
});

describe("途中で終わった書き込みからの復旧", () => {
  it("予定の無い問答は、次に作ろうとした入力で完成する", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, null);

    // 問答だけ入って予定が入らなかった状態を作る（生成が打ち切られた形）
    const { quizItems } = await import("../db/schema");
    await db.insert(quizItems).values({
      id: "orphan", memoId: id, question: "途中の問", answer: "途中の答", createdAt: NOW,
    });

    // このとき一覧は「未作成」に見え、手で作る導線が出る
    expect((await getReviewStates(db, "u1", NOW)).get(id)).toEqual({ kind: "unwritten" });

    const result = await createQuizItem(db, {
      memoId: id, question: "手で書いた問", answer: "手で書いた答", now: NOW, userId: "u1",
    });

    // 以前は always already_exists で、そのメモは削除するまで復習に入れなかった
    expect(result.ok).toBe(true);
    const state = (await getReviewStates(db, "u1", NOW)).get(id);
    expect(state?.kind).toBe("scheduled");
    expect(state && "question" in state ? state.question : null).toBe("手で書いた問");
  });

  it("予定まで揃っている問答は二重に作らせない", async () => {
    const db = createTestDb();
    const id = await memoWithPending(db, null);
    await createQuizItem(db, {
      memoId: id, question: "問", answer: "答", now: NOW, userId: "u1",
    });

    const again = await createQuizItem(db, {
      memoId: id, question: "別の問", answer: "別の答", now: NOW, userId: "u1",
    });

    expect(again).toEqual({ ok: false, error: "already_exists" });
  });
});
