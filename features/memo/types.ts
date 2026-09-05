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
