/**
 * 問と答の文字列そのものに関する規則。
 *
 * **このファイルは何も import しない。** 手で書かれた問答も、モデルが
 * 作った問答も、同じ検証を通す必要がある。生成側（lib/quiz-generation.ts）は
 * D1 やフレームワークを知らない層なので、共有できる形はここに置くしかない。
 * 同じ規則を2箇所に書くと、片方だけ直したときに静かにずれる。
 */

/** 問・答それぞれの長さ上限（文字数）。 */
export const MAX_QUESTION_LENGTH = 200;
export const MAX_ANSWER_LENGTH = 200;

export type QuizTextError = "empty_question" | "empty_answer" | "too_long";

export type ValidatedQuizText =
  | { ok: true; question: string; answer: string }
  | { ok: false; error: QuizTextError };

/**
 * 問と答を検証する。両方が必須。
 *
 * 片方だけの状態を保存させないことが要件であり、検証の失敗は想定された
 * 結果なので例外ではなく戻り値で表す。
 */
export function validateQuizItem(
  rawQuestion: string,
  rawAnswer: string,
): ValidatedQuizText {
  const question = rawQuestion.trim();
  const answer = rawAnswer.trim();

  if (question.length === 0) return { ok: false, error: "empty_question" };
  if (answer.length === 0) return { ok: false, error: "empty_answer" };
  if ([...question].length > MAX_QUESTION_LENGTH) return { ok: false, error: "too_long" };
  if ([...answer].length > MAX_ANSWER_LENGTH) return { ok: false, error: "too_long" };

  return { ok: true, question, answer };
}
