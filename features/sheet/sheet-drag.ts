/**
 * シートを引いて閉じる判定（design.md D4）。
 *
 * **このファイルは何も import しない。** 指の座標と時刻だけを受け取り、
 * 閉じるかどうかを返す。DOM に触れないので、境界をテストで固定できる。
 */

/** 閉じると決める引きの距離。シートの高さに対する割合。 */
export const CLOSE_RATIO = 0.25;
/** 閉じると決める離しぎわの速さ（px/ms、下向き）。 */
export const CLOSE_VELOCITY = 0.5;

export type DragPoint = { y: number; at: number };

/**
 * いま指がどれだけ引いたか。
 *
 * **上へは引けない。** 負を許すとシートが画面より高くなる形が生まれる。
 */
export function dragOffset(start: DragPoint, current: DragPoint): number {
  return Math.max(0, current.y - start.y);
}

/**
 * 離したときに閉じるか。
 *
 * **距離と速さの両方で決める。** 距離だけだと速く弾いても閉じず、速さだけだと
 * ゆっくり大きく引いても閉じない。
 */
export function shouldClose(params: {
  start: DragPoint;
  end: DragPoint;
  /** 直前の点。離しぎわの速さを出すために使う */
  previous: DragPoint;
  sheetHeight: number;
}): boolean {
  const offset = dragOffset(params.start, params.end);
  if (params.sheetHeight > 0 && offset > params.sheetHeight * CLOSE_RATIO) return true;

  const elapsed = params.end.at - params.previous.at;
  if (elapsed <= 0) return false;
  const velocity = (params.end.y - params.previous.y) / elapsed;
  return velocity > CLOSE_VELOCITY && offset > 0;
}

/**
 * その場所から引き始めてよいか（design.md D3）。
 *
 * 中身が一番上まで来ているときだけ引ける。途中まで下げた状態から引けると、
 * **読もうとして下げただけで閉じる**。掴み手は中身の外なので常に引ける。
 */
export function canStartDrag(params: {
  /** 掴み手から始めたか */
  fromGrip: boolean;
  /** 中身のスクロール位置 */
  scrollTop: number;
}): boolean {
  return params.fromGrip || params.scrollTop <= 0;
}
