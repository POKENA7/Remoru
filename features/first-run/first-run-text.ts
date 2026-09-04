import { startOfReviewDay } from "@/features/review/review-scheduler";

/**
 * 初回の導きの文言。
 *
 * 出すのは**最初の問答ができたときの1文だけ**。空の一覧には何も足さない
 * （design.md D2）。
 */

/**
 * 最初の問答ができたことの告知。
 *
 * こちらは `next_review_at` から作る。**実データから作るので嘘にならない。**
 * 「明日」を手で書くと、間隔が変わった日に静かに嘘になる。
 *
 * 日数は**日境界で数える**。時刻の差で割ると、23時に書いたメモが
 * 「0日後」になる。出題日そのものが `startOfReviewDay` の境界で決まって
 * いるので、同じ境界で引く。
 */
export function announcementText(
  nextReviewAt: number,
  now: number,
  /**
   * 通知を差し出せるか。
   *
   * 差し出せるときは**問いかけにする**。「いいよ」で答えられるので、文と
   * ボタンが1つの会話になる。差し出せない端末で問いかけると、**答える手段が
   * 無いまま問いだけが残る**ので、言い切りに戻す。
   */
  asking: boolean,
): string {
  const days = Math.round((startOfReviewDay(nextReviewAt) - startOfReviewDay(now)) / 86_400_000);
  const when = days <= 0 ? "このあと" : days === 1 ? "明日" : `${days}日後`;
  return asking
    ? `${when}、まだ覚えているか尋ねてもいいですか？`
    : `${when}、まだ覚えているか尋ねます`;
}
