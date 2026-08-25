import type { MemoRow } from "./types";

/**
 * 初回の導きを、いま画面に出すかどうか。
 *
 * **判定を画面から離して置く。** 出す・出さないの条件が3つ（導きの状態、
 * 問答の有無、生成の成否）あり、JSX の中に散らすと、どれか1つを変えた
 * ときに他が連れて壊れる。
 */

/**
 * 告知を出すメモと、その文言。出さないなら null。
 *
 * 出すのは**その利用者が初めて問答を持ったとき**だけ。生成の途中は
 * 一覧の状態表示が既に示しているので、出来上がるまで待つ。生成に失敗した
 * ものには何も足さない（design.md D6）。
 */
export function announcement(params: {
  guided: boolean;
  memos: MemoRow[];
  now: number;
}): { memoId: string; nextReviewAt: number; now: number } | null {
  if (params.guided) return null;

  // 出題日が決まっているものだけが対象。生成中・未作成は対象にしない
  const scheduled = params.memos.filter((m) => m.review.kind === "scheduled");
  if (scheduled.length === 0) return null;

  // **最も古い1件に付ける。** 生成が終わる前に何件か書かれることがあり、
  // 「1件のときだけ」にすると、そのとき告知が永久に出ないまま導きも
  // 終わらない。その人が最初に書いたものに付けるのが素直。
  const target = scheduled.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  if (target.review.kind !== "scheduled") return null;
  // 文言そのものは作らない。**通知を差し出せるかで言い回しが変わる**ので、
  // それを知っている画面側で組み立てる（lib/first-run-text.ts）
  return { memoId: target.id, nextReviewAt: target.review.nextReviewAt, now: params.now };
}
