import { and, eq } from "drizzle-orm";
import { memos } from "../db/schema";
import type { AppDb } from "../db/types";
import { createQuizItem } from "./quiz-items";
import {
  generateQuiz,
  type CallModel,
  type GenerationFailure,
} from "./quiz-generation-client";

/**
 * 生成の起動と後始末。
 *
 * design.md D1: メモの保存は生成を待たない。応答を返したあとも続く実行の
 * 枠に渡す。その枠を渡すのは呼び出し側（Workers なら `waitUntil`）で、
 * ここは受け取った関数を呼ぶだけにしてある。
 */

/** 応答後も続く実行に仕事を預ける関数。 */
export type Deferrer = (work: Promise<unknown>) => void;

export type GenerationParams = {
  memoId: string;
  userId: string;
  now: number;
  apiKey: string | undefined | null;
  call?: CallModel;
};

export type FinishOutcome =
  | { ok: true }
  | { ok: false; reason: GenerationFailure | "memo_not_found" };

/** そのメモを生成中の印にする。持ち主でなければ何もしない。 */
async function markPending(
  db: AppDb,
  params: { memoId: string; userId: string; now: number },
): Promise<boolean> {
  const rows = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));
  if (rows.length === 0) return false;

  await db
    .update(memos)
    .set({ quizPendingSince: params.now })
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));
  return true;
}

/**
 * 生成中の印を落とす。
 *
 * 呼び出し前に持ち主は確認済みだが、ここでも絞る。「memoId だけで memos を
 * 更新する関数」を残しておくと、あとから別の場所から呼ばれたときに穴が開く。
 */
async function clearPending(
  db: AppDb,
  params: { memoId: string; userId: string },
): Promise<void> {
  await db
    .update(memos)
    .set({ quizPendingSince: null })
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));
}

/**
 * 生成を実際に行い、結果を書き込む。
 *
 * 問答があれば**中身を書き換える**（作り直し）。無ければ新しく作る。
 * どちらの経路でも、終わったら生成中の印を落とす。
 */
export async function finishGeneration(
  db: AppDb,
  params: GenerationParams,
): Promise<FinishOutcome> {
  // **持ち主で絞る。** 絞らないと、他人のメモの本文をモデルに送ってしまう。
  // 書き込み側（createQuizItem）は所有を確認するので保存は防げるが、
  // 送ってしまったあとでは遅い。
  const owned = await db
    .select({ content: memos.content })
    .from(memos)
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, params.userId)));

  if (owned.length === 0) return { ok: false, reason: "memo_not_found" };

  try {
    const generated = await generateQuiz(owned[0].content, {
      apiKey: params.apiKey,
      call: params.call,
    });

    if (!generated.ok) return { ok: false, reason: generated.reason };

    const created = await createQuizItem(db, {
      memoId: params.memoId,
      question: generated.question,
      answer: generated.answer,
      now: params.now,
      userId: params.userId,
    });

    // すでに問答があるなら何もしない。生成は最初の1回だけを担い、
    // 直すのは人の手（change 13）。二重に走ったときの取りこぼしでもある。
    if (!created.ok && created.error === "already_exists") {
      return { ok: true };
    }

    if (!created.ok) {
      return {
        ok: false,
        reason: created.error === "memo_not_found" ? "memo_not_found" : "invalid_output",
      };
    }
    return { ok: true };
  } finally {
    // 成否によらず印を落とす。残すと、上限を過ぎるまで作成中に見える。
    await clearPending(db, { memoId: params.memoId, userId: params.userId });
  }
}

/**
 * 生成を起こす。**この関数は生成の完了を待たない。**
 *
 * 持ち主でないメモには何もしない。生成の要求ができるのはそのメモを持つ
 * 利用者だけ（spec「生成の持ち主」）。
 */
export async function startGeneration(
  db: AppDb,
  params: GenerationParams & { defer: Deferrer },
): Promise<void> {
  if (!(await markPending(db, params))) return;

  params.defer(
    finishGeneration(db, params).catch(async (error) => {
      console.error("問答の生成が異常終了した", error);
      await clearPending(db, { memoId: params.memoId, userId: params.userId }).catch(() => {});
    }),
  );
}
