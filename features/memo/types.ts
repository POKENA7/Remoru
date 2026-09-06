export type ReviewState =
  | { kind: "unwritten" }
  | { kind: "generating" }
  | { kind: "scheduled"; nextReviewAt: number; question: string };

export type TagRef = { id: string; name: string };

export type MemoRow = {
  id: string;
  userId: string;
  content: string;
  createdAt: number;
  review: ReviewState;
  /** そのメモが持つタグ。いまは最大1件（features/tag/tags.ts の MAX_TAGS_PER_MEMO） */
  tags: TagRef[];
};

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
  });
}

/**
 * 書き込みの結果。**action と画面の両方が読むので、ここに置く。**
 *
 * `"use server"` のファイルから型を輸出すること自体は通るが、置き場としては
 * その機能の `types.ts` が正しい（CLAUDE.md の「置き場」）。
 *
 * design.md D3: 失敗は**機械が読む語**で返し、文言は画面が持つ。理由が
 * リテラルの union になるので、画面側の対応表が総当たりになり、
 * 綴り違いと取りこぼしが型検査で出る。
 */
export type SaveMemoReason = "empty" | "too_long" | "failed";

export type SaveMemoState =
  | { status: "idle" }
  | { status: "saved"; memoId: string }
  | { status: "error"; reason: SaveMemoReason };

export type RewriteContentReason = "empty" | "too_long" | "not_found" | "failed";

export type RewriteContentResult = { ok: true } | { ok: false; reason: RewriteContentReason };

export type RemoveMemoResult = { ok: true } | { ok: false; reason: "not_found" | "failed" };
