/**
 * 受け取ったタグの提案。承認されるまで保持する。
 *
 * 提案そのものは `features/tag/` のものなので、型もここに置く。
 * 以前は画面（`app/app-shell.tsx`）が持っていたが、部品を feature へ移した
 * ときに `features/` から `app/` を参照する形になり、層の向きが逆になった。
 */
export type SuggestionResult = {
  summary: { tag: string; count: number }[];
  assignments: { memoId: string; tag: string }[];
} | null;
