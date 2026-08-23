import { desc, eq } from "drizzle-orm";
import { memos, type Memo } from "../db/schema";
import type { AppDb } from "../db/types";

/** 本文の長さ上限（文字数）。design.md 参照 — 実使用を見て見直す暫定値。 */
export const MAX_CONTENT_LENGTH = 1000;

/**
 * 認証を導入するまでの固定利用者。change 3 で認証済み利用者の識別子に
 * 差し替える。差し替え先はこの定数を参照している箇所のみ。
 */
export const SINGLE_USER_ID = "single-user";

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
  params: { content: string; now: number; userId?: string },
): Promise<CreateMemoResult> {
  const validated = validateMemoContent(params.content);
  if (!validated.ok) {
    return validated;
  }

  const memo: Memo = {
    id: crypto.randomUUID(),
    userId: params.userId ?? SINGLE_USER_ID,
    content: validated.content,
    createdAt: params.now,
  };

  await db.insert(memos).values(memo);

  return { ok: true, memo };
}

/** 保存済みメモを保存時刻の新しい順に返す。 */
export async function listMemos(
  db: AppDb,
  userId: string = SINGLE_USER_ID,
): Promise<Memo[]> {
  return await db
    .select()
    .from(memos)
    .where(eq(memos.userId, userId))
    // 同じ保存時刻のときの順序を決定的にするため id を第二キーに使う
    .orderBy(desc(memos.createdAt), desc(memos.id));
}
