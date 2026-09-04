/**
 * 保持の層。
 *
 * 「1週間以上」の意味は「**1週間空けても思い出せる**」であり、いまの出題
 * 間隔がそのまま該当する（design.md D3）。覚えている期間ではない。
 *
 * **このファイルは何も import しない。** 層の数と境目を変えるのはここ1箇所で
 * 済ませる（design.md Open Questions: 層をいくつにするかは使ってみて決める）。
 */

export type Layer = { label: string; minIntervalDays: number };

/**
 * 下から順に並べる。**間隔の短い層が土台**になる。
 *
 * スケジューラの間隔は [1, 3, 7, 14, 30] 日なので、段階から作れるのは
 * 「1か月以上」まで。3か月以上を出すには記録から数える必要があり、
 * この change では作らない。
 */
export const LAYERS: Layer[] = [
  { label: "1週間以上", minIntervalDays: 7 },
  { label: "1か月以上", minIntervalDays: 30 },
];

/** その間隔がどの層に入るか。どの層にも届かなければ null。 */
export function layerOf(intervalDays: number): Layer | null {
  let found: Layer | null = null;
  for (const layer of LAYERS) {
    if (intervalDays >= layer.minIntervalDays) found = layer;
  }
  return found;
}

/**
 * 層ごとの件数。件数が0の層も返す（並びを保つため）。
 *
 * **累積で数える。** 「1週間以上」は「1週間空けても思い出せる」という意味
 * なので、30日の問答も当てはまる。排他にすると、下の層が上より小さくなって
 * 土台が逆さまになり、しかもラベルの「以上」が嘘になる。
 */
export function countByLayer(intervalDays: number[]): { label: string; count: number }[] {
  return LAYERS.map((layer) => ({
    label: layer.label,
    count: intervalDays.filter((days) => days >= layer.minIntervalDays).length,
  }));
}
