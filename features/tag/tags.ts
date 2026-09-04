import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { memos, memoTags, type Tag, tags } from "../../db/schema";
import type { AppDb } from "../../db/types";
import {
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_MEMO,
  type TagNameError,
  validateTagName,
} from "./tag-text";

// 既存の import 元を変えずに済むよう、規則はここから再輸出する
export { MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_MEMO, validateTagName };

export type TagError = TagNameError | "memo_not_found";

async function ownsMemo(db: AppDb, memoId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: memos.id })
    .from(memos)
    .where(and(eq(memos.id, memoId), eq(memos.userId, userId)));
  return rows.length > 0;
}

/** 名前からタグを引き、無ければ作る。 */
async function findOrCreateTag(
  db: AppDb,
  params: { userId: string; name: string; now: number },
): Promise<Tag> {
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, params.userId), eq(tags.name, params.name)));
  if (existing.length > 0) return existing[0];

  const tag: Tag = {
    id: crypto.randomUUID(),
    userId: params.userId,
    name: params.name,
    createdAt: params.now,
  };
  await db.insert(tags).values(tag);
  return tag;
}

export type SetTagResult = { ok: true; tag: Tag; replaced: Tag[] } | { ok: false; error: TagError };

/**
 * メモにタグを付ける。
 *
 * すでに上限まで持っているときは**古いものから落として**新しいものを入れる
 * （MAX_TAGS_PER_MEMO が1なら差し替え）。同じタグを重ねて付けても増えない。
 */
export async function setTag(
  db: AppDb,
  params: { memoId: string; userId: string; name: string; now: number },
  /**
   * 上限。既定は MAX_TAGS_PER_MEMO。
   *
   * 引数にしてあるのは、**緩めたときに本当に複数持てるのかをテストから
   * 確かめられるようにする**ため。呼び出し側（API ルート）は渡さない。
   * 渡さなければ常に定数が効く。
   */
  limit: number = MAX_TAGS_PER_MEMO,
): Promise<SetTagResult> {
  const validated = validateTagName(params.name);
  if (!validated.ok) return validated;

  // 他人のメモにタグを付けられないよう、所有を確認してから書く
  if (!(await ownsMemo(db, params.memoId, params.userId))) {
    return { ok: false, error: "memo_not_found" };
  }

  const tag = await findOrCreateTag(db, {
    userId: params.userId,
    name: validated.name,
    now: params.now,
  });

  const already = await db
    .select({ tagId: memoTags.tagId })
    .from(memoTags)
    .where(and(eq(memoTags.memoId, params.memoId), eq(memoTags.tagId, tag.id)));
  if (already.length > 0) return { ok: true, tag, replaced: [] };

  await db.insert(memoTags).values({ memoId: params.memoId, tagId: tag.id, createdAt: params.now });

  // 上限を超えたぶんを古いものから落とす。ここが「1つだけ」の実体で、
  // 表の形ではなく規則として持っている（design.md D2）。
  const held = await db
    .select({ tagId: memoTags.tagId, createdAt: memoTags.createdAt })
    .from(memoTags)
    .where(eq(memoTags.memoId, params.memoId))
    .orderBy(asc(memoTags.createdAt), asc(memoTags.tagId));

  // **落とす候補は「いま入れたもの以外」から古い順に採る。**
  // 全体から採ってから自分を除くと、createdAt が同値のとき同点崩しの
  // tagId 次第で自分が候補に入り、1件も落ちずに上限を超えて残る。
  // 提案の受け入れは全件に同じ now を渡すので、同値は普通に起きる。
  const others = held.filter((row) => row.tagId !== tag.id);
  const droppedIds = others.slice(0, Math.max(held.length - limit, 0)).map((row) => row.tagId);

  if (droppedIds.length > 0) {
    await db
      .delete(memoTags)
      .where(and(eq(memoTags.memoId, params.memoId), inArray(memoTags.tagId, droppedIds)));
  }

  const replaced = droppedIds.length
    ? await db.select().from(tags).where(inArray(tags.id, droppedIds))
    : [];

  return { ok: true, tag, replaced };
}

/**
 * メモからタグを外す。
 *
 * 外すのは紐づけだけで、**タグ自体は残す**。他のメモが使っているかもしれず、
 * 使っていなくても付け直せる状態にしておく（spec の要件）。
 */
export async function removeTag(
  db: AppDb,
  params: { memoId: string; userId: string; tagId: string },
): Promise<boolean> {
  if (!(await ownsMemo(db, params.memoId, params.userId))) return false;

  const deleted = await db
    .delete(memoTags)
    .where(and(eq(memoTags.memoId, params.memoId), eq(memoTags.tagId, params.tagId)))
    .returning({ tagId: memoTags.tagId });

  return deleted.length > 0;
}

/** メモごとのタグ。一覧の描画に使う。 */
export async function getTagsForMemos(db: AppDb, userId: string): Promise<Map<string, Tag[]>> {
  const rows = await db
    .select({
      memoId: memoTags.memoId,
      id: tags.id,
      userId: tags.userId,
      name: tags.name,
      createdAt: tags.createdAt,
    })
    .from(memoTags)
    .innerJoin(memos, eq(memos.id, memoTags.memoId))
    .innerJoin(tags, eq(tags.id, memoTags.tagId))
    .where(eq(memos.userId, userId))
    .orderBy(asc(memoTags.createdAt));

  const byMemo = new Map<string, Tag[]>();
  for (const row of rows) {
    const list = byMemo.get(row.memoId) ?? [];
    list.push({ id: row.id, userId: row.userId, name: row.name, createdAt: row.createdAt });
    byMemo.set(row.memoId, list);
  }
  return byMemo;
}

/** 絞り込みに出すタグの一覧。名前と、そのタグを持つ自分のメモの件数。 */
export async function listTagsWithCounts(
  db: AppDb,
  userId: string,
): Promise<{ id: string; name: string; count: number }[]> {
  return await db
    .select({
      id: tags.id,
      name: tags.name,
      // memo_tags ではなく memos を数える。memo_tags を数えると、
      // 他人のメモが自分のタグに紐づいた行まで件数に入る
      count: sql<number>`count(${memos.id})`.as("count"),
    })
    .from(tags)
    .leftJoin(memoTags, eq(memoTags.tagId, tags.id))
    .leftJoin(memos, and(eq(memos.id, memoTags.memoId), eq(memos.userId, userId)))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name));
}
