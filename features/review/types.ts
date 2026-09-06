export type DueItem = {
  quizItemId: string;
  memoId: string;
  question: string;
  answer: string;
  memoContent: string;
  occurrenceAt: number;
};

/**
 * 採点の結果。action と画面の両方が読むのでここに置く。
 *
 * design.md D3: 失敗は**機械が読む語**で返し、文言は画面が持つ。
 * 二重送信は失敗ではない——`gradeReview` がべき等に吸収する（change 4 D4）。
 */
export type RecordGradeResult =
  | { ok: true; nextReviewAt: number; applied: boolean }
  | { ok: false; reason: "not_found" | "failed" };
