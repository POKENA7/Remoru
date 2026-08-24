export type ReviewState =
  | { kind: "unwritten" }
  | { kind: "generating" }
  | { kind: "scheduled"; nextReviewAt: number; question: string };

export type MemoRow = {
  id: string;
  userId: string;
  content: string;
  createdAt: number;
  review: ReviewState;
};

export type DueItem = {
  quizItemId: string;
  memoId: string;
  question: string;
  answer: string;
  memoContent: string;
  occurrenceAt: number;
};

export const MAX_CONTENT_LENGTH = 1000;

export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
  });
}
