"use server";

import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { gradeReview } from "./review";
import type { RecordGradeResult } from "./types";

/**
 * 復習の書き込みの入口。形は `features/memo/actions.ts` と同じ
 * （design.md D1・D4・D6）。
 */

/**
 * 自己採点を記録する。
 *
 * `occurrenceAt` は画面が表示していた出題日。これで二重送信を弾く
 * （change 4 D4）。**弾く仕組みは `gradeReview` にあり、ここでは足さない。**
 */
export async function recordGrade(
  quizItemId: string,
  recalled: boolean,
  occurrenceAt: number,
): Promise<RecordGradeResult> {
  /*
   * **`recalled` を truthy で判定させない。** `review-scheduler.ts` の
   * `schedule()` は `if (!outcome.recalled)` で分岐するので、`"false"` の
   * ような空でない文字列が届くと**「忘れてた」が「覚えてた」として記録され、
   * 復習の間隔が静かに壊れる。** 型注釈は実行時に消えるので、ここで確かめる。
   *
   * Route Handler にはこの検査があった。action に移したときに落としており、
   * レビューで指摘されて戻した。
   */
  if (typeof recalled !== "boolean" || !Number.isFinite(occurrenceAt)) {
    return { ok: false, reason: "failed" };
  }
  if (typeof quizItemId !== "string") return { ok: false, reason: "failed" };

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await gradeReview(db, {
      quizItemId,
      recalled,
      occurrenceAt,
      now: Date.now(),
      userId,
    });
    if (!result.ok) return { ok: false, reason: result.error };

    /*
     * **ここでは `refresh()` を呼ばない**（design.md D5 の例外）。
     *
     * 復習は 1 枚ずつ進む。採点のたびに経路を描き直すと、画面が持っている
     * `items` が 1 件ずつ縮む一方で「何枚目か」は進むので、**カードが 1 枚
     * 飛ぶ。** 取り直すのは 1 回の復習が終わったとき（またはやめたとき）で、
     * その契機は画面が持っている。
     */
    return { ok: true, nextReviewAt: result.nextReviewAt, applied: result.applied };
  } catch (error) {
    console.error("採点を記録できなかった", error);
    return { ok: false, reason: "failed" };
  }
}
