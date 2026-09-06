"use server";

import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { finishGuide } from "./first-run";

/**
 * 初回の導きを終えたものとして記録する。
 *
 * 告知を見せた時点で呼ぶ。**見送っても終わる**（change 9 D5）。この場面が
 * 二度と訪れないことが、通知を繰り返し求めないことの担保になっている。
 *
 * **`refresh()` を呼ばない**（design.md D5）。呼ぶと、告知を出した直後に
 * `guided` が真になった状態で描き直され、**出した瞬間に告知が消える。**
 *
 * 戻り値を持たない。呼び出し側は結果を待たず、失敗しても告知は出したまま
 * にする（次に開いたときにまた出るが、一度も見せないよりよい）。
 */
export async function markGuided(): Promise<void> {
  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**（design.md D4）——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる
  const userId = await verifySession();

  try {
    const db = await getDb();
    await finishGuide(db, { userId, now: Date.now() });
  } catch (error) {
    console.error("初回の導きを記録できなかった", error);
  }
}
