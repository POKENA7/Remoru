/**
 * 進捗マスの塗り具合を返す（docs/design-decisions.md）。
 *
 * マスは最大10個。10枚までは1マス＝1枚。11枚以上はマス数を10に固定し、
 * 1マスが複数枚を表して途中まで塗られる。溢れない・潰れない。
 *
 * 表示（app/review-tab.tsx）とテスト（app/cells.test.ts）の両方がこれを使う。
 * 複製すると、片方だけ直したときに気づけなくなる。
 */
export const MAX_CELLS = 10;

export function cellFills(total: number, done: number): number[] {
  if (total <= 0) return [];
  const count = Math.min(total, MAX_CELLS);
  const perCell = total / count;
  return Array.from({ length: count }, (_, i) =>
    Math.min(Math.max((done - i * perCell) / perCell, 0), 1),
  );
}
