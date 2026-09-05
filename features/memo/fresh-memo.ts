/**
 * 「いま書いた1件」を憶える箱（design.md D2）。
 *
 * **刷りの合図に mount を使わない。** メモの一覧は `MemoTab` ごと unmount
 * される（タブの切り替えとメモの詳細）ので、mount を合図にすると戻るたびに
 * 全行が刷り直される。
 *
 * 一度刷ったら消す。残したままにすると、次の unmount でまた刷られる。
 */
export type FreshMemo = string | null;

/** 保存した直後の1件を憶える。 */
export function markFresh(memoId: string): FreshMemo {
  return memoId;
}

/**
 * この行を刷るか。刷るなら、そのあと憶えを外す指示も返す。
 *
 * **判定と後始末を1つにしてある。** 別々にすると、判定だけ書いて外し忘れる。
 */
export function takeFresh(fresh: FreshMemo, memoId: string): boolean {
  return fresh !== null && fresh === memoId;
}
