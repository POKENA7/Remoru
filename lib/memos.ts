import { and, desc, eq } from "drizzle-orm";
import { memos, type Memo } from "../db/schema";
import type { AppDb } from "../db/types";

/** 本文の長さ上限（文字数）。design.md 参照 — 実使用を見て見直す暫定値。 */
export const MAX_CONTENT_LENGTH = 1000;

export type ValidationError = "empty" | "too_long";

export type ValidatedContent =
  | { ok: true; content: string }
  | { ok: false; error: ValidationError };

/**
 * 本文を検証し、保存に使う正規化済みの文字列を返す。
 *
 * 検証の失敗は想定された結果なので例外ではなく戻り値で表す。
 */
export function validateMemoContent(raw: string): ValidatedContent {
  const content = raw.trim();

  if (content.length === 0) {
    return { ok: false, error: "empty" };
  }

  // 絵文字などのサロゲートペアを1文字として数える
  if ([...content].length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: "too_long" };
  }

  return { ok: true, content };
}

export type CreateMemoResult =
  | { ok: true; memo: Memo }
  | { ok: false; error: ValidationError };

/**
 * メモを1件保存する。
 *
 * 現在時刻は呼び出し側から受け取る（内部で時計を読まない）。保存時刻に
 * 依存する振る舞いをテストから決定的に検証できるようにするため。
 */
export async function createMemo(
  db: AppDb,
  params: { content: string; now: number; userId: string },
): Promise<CreateMemoResult> {
  const validated = validateMemoContent(params.content);
  if (!validated.ok) {
    return validated;
  }

  const memo: Memo = {
    id: crypto.randomUUID(),
    userId: params.userId,
    content: validated.content,
    createdAt: params.now,
    // 生成を起こすかどうかは呼び出し側が決める（design.md D1）
    quizPendingSince: null,
  };

  await db.insert(memos).values(memo);

  return { ok: true, memo };
}

/** 保存済みメモを保存時刻の新しい順に返す。 */
export async function listMemos(db: AppDb, userId: string): Promise<Memo[]> {
  return await db
    .select()
    .from(memos)
    .where(eq(memos.userId, userId))
    // 同じ保存時刻のときの順序を決定的にするため id を第二キーに使う
    .orderBy(desc(memos.createdAt), desc(memos.id));
}

export type DeleteMemoResult = { ok: true } | { ok: false; error: "not_found" };

/**
 * メモを削除する。紐づく問答とスケジュールはデータベース側の
 * ON DELETE CASCADE で消える（design.md D5）。ここで順に消さない。
 */
export async function deleteMemo(
  db: AppDb,
  params: { memoId: string; userId: string },
): Promise<DeleteMemoResult> {
  const userId = params.userId;

  const owned = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.id, params.memoId), eq(memos.userId, userId)));
  if (owned.length === 0) return { ok: false, error: "not_found" };

  await db.delete(memos).where(eq(memos.id, params.memoId));
  return { ok: true };
}
