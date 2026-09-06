"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import {
  applyAssignments,
  dismissSuggestion,
  proposeTags,
  suggestionStatus,
} from "./tag-suggestion-run";
import { removeTag, setTag } from "./tags";
import type { AcceptResult, AssignTagResult, ProposeResult, UnassignTagResult } from "./types";

/**
 * タグの書き込みの入口。形は `features/memo/actions.ts` と同じ
 * （design.md D1・D4・D6）。
 */

/**
 * メモにタグを付ける。
 *
 * すでにタグを持つメモに別のタグを付けると差し替わる（change 6 D2）。
 * 上限は `features/tag/tags.ts` の定数で決まっており、ここからは渡さない。
 */
export async function assignTag(memoId: string, name: string): Promise<AssignTagResult> {
  if (typeof memoId !== "string" || typeof name !== "string") {
    return { ok: false, reason: "failed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await setTag(db, { memoId, userId, name, now: Date.now() });
    // 持ち主でないメモは "memo_not_found"。存在するかどうかを区別させない
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return { ok: true, tag: { id: result.tag.id, name: result.tag.name } };
  } catch (error) {
    console.error("タグを付けられなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/** メモからタグを外す。自分のものでなければ何も外さない。 */
export async function unassignTag(memoId: string, tagId: string): Promise<UnassignTagResult> {
  if (typeof memoId !== "string" || typeof tagId !== "string") {
    return { ok: false, reason: "failed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    await removeTag(db, { memoId, userId, tagId });

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("タグを外せなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * 未分類のメモにタグを提案させる。**DB は変えない。**
 *
 * design.md D5: したがって `refresh()` を呼ばない。呼ぶ理由が無いのに
 * 呼ぶと、受け取った提案を持っている画面が描き直される。
 */
export async function requestTagSuggestion(): Promise<ProposeResult> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();

    /*
     * 帯が出ていない状態では呼ばせない。**呼び出し1回がそのまま課金に
     * なる**ので、契機の判断を画面側だけに置かない。Server Action は
     * 公開された宛先で、画面を経由しない呼び出しが届きうる（design.md D6）。
     */
    const status = await suggestionStatus(db, userId);
    if (!status.show) return { ok: false, reason: "not_ready" };

    const result = await proposeTags(db, { userId, apiKey: process.env.ANTHROPIC_API_KEY });
    if (!result.ok) return { ok: false, reason: "failed" };

    // 承認に出すのはタグ名と件数だけ。どのメモに何が付くかは返すが、
    // 画面には出さない（受け入れのときにそのまま送り返してもらう）
    return { ok: true, summary: result.summary, assignments: result.assignments };
  } catch (error) {
    console.error("タグの提案が異常終了した", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * 提案を受け入れる。
 *
 * 受け取る割り当ては要求由来なので、**形だけを確かめて渡す。** 持ち主の確認と
 * 1メモ1タグの規則は `applyAssignments` の先（`setTag`）が担う。
 *
 * Route Handler にはこの絞り込みがあった。action に移したときに落としており、
 * レビューで指摘されて戻した。**型注釈は実行時に消える。**
 */
export async function acceptTagSuggestion(
  assignments: { memoId: string; tag: string }[],
): Promise<AcceptResult> {
  if (!Array.isArray(assignments)) return { ok: false, reason: "failed" };
  const valid = assignments.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { memoId, tag } = item as Record<string, unknown>;
    if (typeof memoId !== "string" || typeof tag !== "string") return [];
    return [{ memoId, tag }];
  });

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await applyAssignments(db, { userId, assignments: valid, now: Date.now() });
    // 1件も付かなかったのは、利用者から見れば失敗である。提案は捨てさせない
    if (result.applied === 0) return { ok: false, reason: "failed" };

    refresh();
    return { ok: true, applied: result.applied, skipped: result.skipped };
  } catch (error) {
    console.error("提案されたタグを付けられなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/** 提案を断る。次にたまるまで出さない。 */
export async function dismissTagSuggestion(): Promise<void> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    await dismissSuggestion(db, { userId, now: Date.now() });
    refresh();
  } catch (error) {
    // 断れなくても害は無い。帯が残るだけ
    console.error("提案を断れなかった", error);
  }
}
