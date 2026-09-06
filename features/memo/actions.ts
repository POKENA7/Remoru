"use server";

import { refresh } from "next/cache";
import { getDb, getDeferrer } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { startGeneration } from "@/features/quiz/quiz-generation-run";
import { createMemo, deleteMemo, updateMemoContent } from "./memos";
import type { RemoveMemoResult, RewriteContentResult, SaveMemoState } from "./types";

/**
 * メモの書き込みの入口。`queries.ts`（読み取りの入口）と対になる。
 *
 * design.md D6: **各 action が自分でセッションを確かめる。** Server Action は
 * 公開された POST の宛先で、呼び出し元の画面が認証済みであることは
 * 「認証済みの呼び出ししか来ない」担保にならない。
 *
 * design.md D4: **予測可能な失敗も、想定外の失敗も戻り値で表す。** throw すると
 * `error.tsx`（まだ置いていないので Next.js の既定のエラー画面）に吸われ、
 * 入力中の内容ごと画面が差し替わる。spec が複数箇所で「失敗を操作した場所で
 * 示し、再実行できる状態を保つ」と定めているので、それを守れない。
 *
 * design.md D5: 書いたあとは `refresh()`。`revalidatePath()` は使わない
 * （Remoru にはサーバー側で捨てるキャッシュが無く、Router Cache を捨てる損だけが残る）。
 *
 * **export するものは全部が公開エンドポイントになる。** ヘルパは export しない。
 *
 *  * 引数を実行時に確かめる。
 *
 * **型注釈は実行時に消える。** Server Action は公開された POST の宛先なので、
 * 画面を経由しない呼び出しでは宣言と違う値が届く（design.md D6）。
 * Route Handler にあった `typeof` の検査は、引数に型が付いたからといって
 * 要らなくなったわけではない——**消えたのは検査ではなく、検査を書く場所の
 * 分かりやすさだけである。**
 */

/**
 * メモを1件保存する。
 *
 * `<form action={...}>` から呼ぶので `FormData` を受け取る（design.md D2）。
 * 失敗しても入力が残るのは、`<form>` 側が値を保っているためである。
 */
export async function saveMemo(_prev: SaveMemoState, formData: FormData): Promise<SaveMemoState> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const content = formData.get("content");
    if (typeof content !== "string") return { status: "error", reason: "empty" };

    const db = await getDb();
    /*
     * 時計はここで読み、ドメイン層には値として渡す。
     *
     * **`requestNow()` は使わない。** あれは「1 回の描画の中で複数の取得が
     * 違う時刻を見ないように」するためのもので（L07）、書き込みは 1 回で
     * 終わるので揃える相手がいない。`cache()` を描画の外で使うのも避ける。
     */
    const now = Date.now();
    const result = await createMemo(db, { content, now, userId });
    if (!result.ok) return { status: "error", reason: result.error };

    // 保存は生成を待たない（change 1 D1）。鍵が無ければ何も起きず、
    // そのメモは未作成のまま残る。
    await startGeneration(db, {
      memoId: result.memo.id,
      userId,
      now,
      apiKey: process.env.ANTHROPIC_API_KEY,
      defer: await getDeferrer(),
    });

    refresh();
    return { status: "saved", memoId: result.memo.id };
  } catch (error) {
    console.error("メモを保存できなかった", error);
    return { status: "error", reason: "failed" };
  }
}

/**
 * メモの本文を書き直す。
 *
 * **問答とスケジュールには触れない**（change 14 D5）。触らないことは
 * `updateMemoContent` が担っており、ここでは足さない。
 */
export async function rewriteMemoContent(
  memoId: string,
  content: string,
): Promise<RewriteContentResult> {
  if (typeof memoId !== "string" || typeof content !== "string") {
    return { ok: false, reason: "failed" };
  }

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await updateMemoContent(db, { memoId, content, userId });
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("メモの本文を書き直せなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/** メモを削除する。問答とスケジュールは DB 側の連鎖で消える。 */
export async function removeMemo(memoId: string): Promise<RemoveMemoResult> {
  if (typeof memoId !== "string") return { ok: false, reason: "failed" };

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    // 持ち主でないメモは「無い」として返る。他人のメモの有無を区別させない
    const result = await deleteMemo(db, { memoId, userId });
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("メモを削除できなかった", error);
    return { ok: false, reason: "failed" };
  }
}
