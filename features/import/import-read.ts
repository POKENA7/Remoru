import { getMemo, listMemos } from "@/features/memo/memos";
import type { MemoRow } from "@/features/memo/types";
import { getQuizItem, getReviewStates } from "@/features/quiz/quiz-items";
import { getTagsForMemos, listTagsWithCounts } from "@/features/tag/tags";
import type { Memo } from "../../db/schema";
import type { AppDb } from "../../db/types";

/**
 * 取り込みAPIの読み取り。
 *
 * 一覧の Container と同じ取得を組み立てる（design D4）。**利用者の識別子は
 * 応答に含めない。** 外から要らないうえ、識別子を配る理由が無い。
 */

export type ApiMemo = Omit<MemoRow, "userId">;
export type ApiMemoDetail = ApiMemo & { answer: string | null };
export type ApiTag = { id: string; name: string; count: number };

type ReviewStates = Awaited<ReturnType<typeof getReviewStates>>;
type TagsByMemo = Awaited<ReturnType<typeof getTagsForMemos>>;

/** メモ1件を、復習の状態とタグを添えた応答の形にする。 */
function toApiMemo(memo: Memo, states: ReviewStates, tagsByMemo: TagsByMemo): ApiMemo {
  return {
    id: memo.id,
    content: memo.content,
    createdAt: memo.createdAt,
    review: states.get(memo.id) ?? { kind: "unwritten" },
    tags: (tagsByMemo.get(memo.id) ?? []).map((t) => ({ id: t.id, name: t.name })),
  };
}

/** 利用者のメモを新しい順に返す。 */
export async function listMemosForApi(
  db: AppDb,
  params: { userId: string; tagId?: string; limit?: number; now: number },
): Promise<ApiMemo[]> {
  const [memos, states, tagsByMemo] = await Promise.all([
    listMemos(db, params.userId, params.tagId, params.limit),
    getReviewStates(db, params.userId, params.now),
    getTagsForMemos(db, params.userId),
  ]);

  return memos.map((memo) => toApiMemo(memo, states, tagsByMemo));
}

/**
 * メモ1件の詳細を返す。他人のものと存在しないものは、どちらも null。
 *
 * 答えは `getQuizItem` から取る。一覧の状態は問だけを返すため（想起の機会を
 * 壊さない）、詳細のときだけ1件引く。
 */
export async function getMemoForApi(
  db: AppDb,
  params: { userId: string; memoId: string; now: number },
): Promise<ApiMemoDetail | null> {
  const memo = await getMemo(db, params.userId, params.memoId);
  if (!memo) return null;

  const [states, tagsByMemo, quiz] = await Promise.all([
    getReviewStates(db, params.userId, params.now),
    getTagsForMemos(db, params.userId),
    getQuizItem(db, { memoId: params.memoId, userId: params.userId }),
  ]);

  return { ...toApiMemo(memo, states, tagsByMemo), answer: quiz?.answer ?? null };
}

/** 利用者のタグを名前順に返す。 */
export async function listTagsForApi(db: AppDb, userId: string): Promise<ApiTag[]> {
  return await listTagsWithCounts(db, userId);
}
