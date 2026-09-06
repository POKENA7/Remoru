/**
 * 問と答の書き込みの結果。action と画面の両方が読むのでここに置く。
 *
 * design.md D3: 失敗は**機械が読む語**で返し、文言は画面が持つ。
 */
export type WriteQuizReason =
  | "empty_question"
  | "empty_answer"
  | "too_long"
  | "memo_not_found"
  | "already_exists"
  | "failed";

export type WriteQuizResult =
  | { ok: true; question: string; answer: string; nextReviewAt: number }
  | { ok: false; reason: WriteQuizReason };
