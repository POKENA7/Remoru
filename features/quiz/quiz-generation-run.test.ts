import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memos } from "../../db/schema";
import { createMemo } from "@/features/memo/memos";
import { QUIZ_TOOL_NAME } from "./quiz-generation";
import type { CallModel } from "./quiz-generation-client";
import { finishGeneration, startGeneration } from "./quiz-generation-run";
import { getReviewStates } from "./quiz-items";
import { createTestDb } from "@/tests/helpers/test-db";

const NOW = Date.UTC(2026, 7, 24, 3, 0, 0);
const CONTENT = "近所のパン屋は火曜定休";

function toolResponse(question: string, answer: string) {
  return { content: [{ type: "tool_use", name: QUIZ_TOOL_NAME, input: { question, answer } }] };
}

function succeeds(question = "定休日は？", answer = "火曜"): { calls: unknown[]; call: CallModel } {
  const calls: unknown[] = [];
  return {
    calls,
    call: async (input) => {
      calls.push(input);
      return toolResponse(question, answer);
    },
  };
}

async function seedMemo(db: ReturnType<typeof createTestDb>, userId = "u1") {
  const created = await createMemo(db, { content: CONTENT, now: NOW, userId });
  if (!created.ok) throw new Error("メモを作れなかった");
  return created.memo.id;
}

async function pendingSince(db: ReturnType<typeof createTestDb>, memoId: string) {
  const rows = await db
    .select({ quizPendingSince: memos.quizPendingSince })
    .from(memos)
    .where(eq(memos.id, memoId));
  return rows[0].quizPendingSince;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("保存は生成を待たない", () => {
  it("生成が終わらなくても起動は返る", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    // こちらが解放するまで終わらない呼び先。生成を待つ実装なら、
    // startGeneration がここで止まる。
    let release!: () => void;
    const blocked = new Promise<unknown>((resolve) => {
      release = () => resolve(toolResponse("問", "答"));
    });
    const call: CallModel = () => blocked;

    const deferred: Promise<unknown>[] = [];
    await startGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      call,
      defer: (work) => deferred.push(work),
    });

    // 起動は返っており、生成はまだ預けられたまま
    expect(deferred).toHaveLength(1);
    expect(await pendingSince(db, memoId)).toBe(NOW);

    const states = await getReviewStates(db, "u1", NOW);
    expect(states.get(memoId)).toEqual({ kind: "generating" });

    release();
    await deferred[0];
    // 解放したあとは、預けた仕事が最後まで走る
    expect((await getReviewStates(db, "u1", NOW)).get(memoId)?.kind).toBe("scheduled");
  });
});

describe("生成が成功したとき", () => {
  it("メモが復習の対象に入る", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    const result = await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      ...succeeds(),
    });

    expect(result).toEqual({ ok: true });
    const state = (await getReviewStates(db, "u1", NOW)).get(memoId);
    expect(state?.kind).toBe("scheduled");
  });

  it("生成中の印を落とす", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      ...succeeds(),
    });

    expect(await pendingSince(db, memoId)).toBeNull();
  });
});

describe("生成が失敗したとき", () => {
  it("メモは残り、未作成になる", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);

    const result = await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      call: async () => {
        throw new Error("500");
      },
    });

    expect(result).toEqual({ ok: false, reason: "request_failed" });
    expect((await getReviewStates(db, "u1", NOW)).get(memoId)).toEqual({ kind: "unwritten" });
  });

  it("失敗でも生成中の印を落とす", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    await db.update(memos).set({ quizPendingSince: NOW }).where(eq(memos.id, memoId));

    await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      call: async () => ({ content: [{ type: "text", text: "だめ" }] }),
    });

    // 落とさないと、上限を過ぎるまで作成中に見えたまま止まる
    expect(await pendingSince(db, memoId)).toBeNull();
  });

  it("鍵が無ければ未作成のままにする", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db);
    const { calls, call } = succeeds();

    const result = await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: undefined,
      call,
    });

    expect(result).toEqual({ ok: false, reason: "no_key" });
    expect(calls).toEqual([]);
    expect((await getReviewStates(db, "u1", NOW)).get(memoId)).toEqual({ kind: "unwritten" });
  });
});

describe("生成の持ち主", () => {
  it("他人のメモは生成できない。本文もモデルに渡らない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db, "u1");
    const { calls, call } = succeeds();

    const result = await finishGeneration(db, {
      memoId,
      userId: "u2",
      now: NOW,
      apiKey: "key",
      call,
    });

    expect(result).toEqual({ ok: false, reason: "memo_not_found" });
    // 書き込みを止めるだけでは足りない。送ってしまったあとでは遅い。
    expect(calls).toEqual([]);
    expect((await getReviewStates(db, "u1", NOW)).get(memoId)).toEqual({ kind: "unwritten" });
  });

  it("他人のメモを生成中にできない", async () => {
    const db = createTestDb();
    const memoId = await seedMemo(db, "u1");

    const deferred: Promise<unknown>[] = [];
    await startGeneration(db, {
      memoId,
      userId: "u2",
      now: NOW,
      apiKey: "key",
      ...succeeds(),
      defer: (work) => deferred.push(work),
    });

    expect(deferred).toEqual([]);
    expect(await pendingSince(db, memoId)).toBeNull();
  });
});

describe("生成は最初の1回だけ", () => {
  /** 何度か復習を終えた状態を作る。 */
  async function advancedReview(db: ReturnType<typeof createTestDb>) {
    const memoId = await seedMemo(db);
    await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      ...succeeds("最初の問", "最初の答"),
    });

    const { quizItems, reviewSchedules } = await import("../../db/schema");
    const item = (await db.select().from(quizItems).where(eq(quizItems.memoId, memoId)))[0];

    const advanced = {
      nextReviewAt: NOW + 14 * 24 * 60 * 60 * 1000,
      state: '{"stage":3,"recoverTo":null}',
    };
    await db.update(reviewSchedules).set(advanced).where(eq(reviewSchedules.quizItemId, item.id));

    return { memoId, quizItemId: item.id, advanced };
  }

  it("すでに問答があれば置き換えない", async () => {
    const db = createTestDb();
    const { memoId } = await advancedReview(db);

    // 保存直後に利用者が手で書いた場合、遅れて届いた生成結果が
    // それを上書きしてはいけない
    const result = await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      ...succeeds("あとから来た問", "あとから来た答"),
    });

    expect(result).toEqual({ ok: true });
    const { quizItems } = await import("../../db/schema");
    const items = await db.select().from(quizItems).where(eq(quizItems.memoId, memoId));
    expect(items[0].question).toBe("最初の問");
  });

  it("失敗したら以前の問と答が残り、復習の対象からも外れない", async () => {
    const db = createTestDb();
    const { memoId, quizItemId, advanced } = await advancedReview(db);

    const result = await finishGeneration(db, {
      memoId,
      userId: "u1",
      now: NOW,
      apiKey: "key",
      call: async () => {
        throw new Error("500");
      },
    });
    expect(result).toEqual({ ok: false, reason: "request_failed" });

    const { quizItems, reviewSchedules } = await import("../../db/schema");
    const items = await db.select().from(quizItems).where(eq(quizItems.memoId, memoId));
    expect(items[0].question).toBe("最初の問");

    const schedules = await db
      .select()
      .from(reviewSchedules)
      .where(eq(reviewSchedules.quizItemId, quizItemId));
    expect(schedules[0].nextReviewAt).toBe(advanced.nextReviewAt);
    expect((await getReviewStates(db, "u1", NOW)).get(memoId)?.kind).toBe("scheduled");
  });

  it("他人のメモには生成が走らない", async () => {
    const db = createTestDb();
    const { memoId } = await advancedReview(db);
    const { calls, call } = succeeds("乗っ取り", "乗っ取り");

    const result = await finishGeneration(db, {
      memoId,
      userId: "u2",
      now: NOW,
      apiKey: "key",
      call,
    });

    expect(result).toEqual({ ok: false, reason: "memo_not_found" });
    expect(calls).toEqual([]);
    const { quizItems } = await import("../../db/schema");
    const items = await db.select().from(quizItems).where(eq(quizItems.memoId, memoId));
    expect(items[0].question).toBe("最初の問");
  });
});
