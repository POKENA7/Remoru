import { and, eq, isNull, sql } from "drizzle-orm";
import { memoTags, memos, tagSuggestionState, tags } from "../db/schema";
import type { AppDb } from "../db/types";
import { setTag } from "./tags";
import { shouldSuggest, summarize, type Assignment, type SuggestionSummary } from "./tag-suggestion";
import {
  suggestTags,
  type CallModel,
  type SuggestionFailure,
} from "./tag-suggestion-client";

/** タグを1つも持たないメモ。提案の対象。 */
export async function listUntaggedMemos(
  db: AppDb,
  userId: string,
): Promise<{ id: string; content: string }[]> {
  return await db
    .select({ id: memos.id, content: memos.content })
    .from(memos)
    .leftJoin(memoTags, eq(memoTags.memoId, memos.id))
    .where(and(eq(memos.userId, userId), isNull(memoTags.memoId)));
}

async function dismissedAtCount(db: AppDb, userId: string): Promise<number | null> {
  const rows = await db
    .select({ count: tagSuggestionState.dismissedAtCount })
    .from(tagSuggestionState)
    .where(eq(tagSuggestionState.userId, userId));
  return rows[0]?.count ?? null;
}

/** いま提案の帯を出すべきか。件数も返す（画面に出すため）。 */
export async function suggestionStatus(
  db: AppDb,
  userId: string,
): Promise<{ show: boolean; untaggedCount: number }> {
  // 件数だけを数える。この関数は一覧の読み込みごとに走るので、本文まで
  // 引くと未分類が増えるほど毎回の転送が重くなる。
  const count = await countUntagged(db, userId);
  const dismissed = await dismissedAtCount(db, userId);
  return { show: shouldSuggest(count, dismissed), untaggedCount: count };
}

/** 提案を断る。次にたまるまで出さない（design.md D10）。 */
export async function dismissSuggestion(
  db: AppDb,
  params: { userId: string; now: number },
): Promise<void> {
  const untagged = await listUntaggedMemos(db, params.userId);
  await db
    .insert(tagSuggestionState)
    .values({
      userId: params.userId,
      dismissedAtCount: untagged.length,
      dismissedAt: params.now,
    })
    .onConflictDoUpdate({
      target: tagSuggestionState.userId,
      set: { dismissedAtCount: untagged.length, dismissedAt: params.now },
    });
}

export type ProposeOutcome =
  | { ok: true; assignments: Assignment[]; summary: SuggestionSummary[] }
  | { ok: false; reason: SuggestionFailure };

/**
 * 未分類のメモにタグを提案させる。**ここでは何も書き込まない。**
 *
 * 承認はタグ名と件数だけで行うので（design.md 制約3）、提案の中身は
 * 受け入れが押されるまで保持しない。押されたら apply に渡す。
 */
export async function proposeTags(
  db: AppDb,
  params: { userId: string; apiKey: string | undefined | null; call?: CallModel },
): Promise<ProposeOutcome> {
  const untagged = await listUntaggedMemos(db, params.userId);
  if (untagged.length === 0) return { ok: true, assignments: [], summary: [] };
  const existing = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.userId, params.userId));

  const result = await suggestTags(
    untagged,
    existing.map((t) => t.name),
    { apiKey: params.apiKey, call: params.call },
  );
  if (!result.ok) return result;

  return { ok: true, assignments: result.assignments, summary: summarize(result.assignments) };
}

/**
 * 提案を受け入れてタグを付ける。
 *
 * 付与は `setTag` を通す。**持ち主の確認も1メモ1タグの規則も、そこに
 * 集まっている。** ここで直接 memo_tags を触ると規則を回避してしまう。
 */
export async function applyAssignments(
  db: AppDb,
  params: { userId: string; assignments: Assignment[]; now: number },
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;

  for (const assignment of params.assignments) {
    // 1件の失敗で残りを止めない
    try {
      const result = await setTag(db, {
        memoId: assignment.memoId,
        userId: params.userId,
        name: assignment.tag,
        now: params.now,
      });
      if (result.ok) applied += 1;
      else skipped += 1;
    } catch (error) {
      console.error("提案されたタグを付けられなかった", error);
      skipped += 1;
    }
  }

  return { applied, skipped };
}

/** 未分類の件数だけを数える（画面の表示用）。 */
export async function countUntagged(db: AppDb, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(memos)
    .leftJoin(memoTags, eq(memoTags.memoId, memos.id))
    .where(and(eq(memos.userId, userId), isNull(memoTags.memoId)));
  return rows[0]?.n ?? 0;
}
