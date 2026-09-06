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

/**
 * タグの書き込みの結果。action と画面の両方が読むのでここに置く。
 *
 * design.md D3: 失敗は**機械が読む語**で返し、文言は画面が持つ。
 */
export type AssignTagReason = "empty_name" | "too_long" | "memo_not_found" | "failed";

export type AssignTagResult =
  | { ok: true; tag: { id: string; name: string } }
  | { ok: false; reason: AssignTagReason };

export type UnassignTagResult = { ok: true } | { ok: false; reason: "failed" };

/** 提案の取得。**DB は変えない**ので、失敗しても状態は元のまま */
export type ProposeResult =
  | {
      ok: true;
      summary: { tag: string; count: number }[];
      assignments: { memoId: string; tag: string }[];
    }
  | { ok: false; reason: "not_ready" | "failed" };

/** 提案の承認。1件も付かなかったときは失敗として扱う（提案は捨てない） */
export type AcceptResult =
  | { ok: true; applied: number; skipped: number }
  | { ok: false; reason: "failed" };
