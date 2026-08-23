/**
 * 通知の本文を組み立てる（design.md D5）。
 *
 * 件数と、出題順で先頭にあたる問いを載せる。
 * **答えとメモの本文は載せない。** 答えが見えると想起の機会そのものが
 * 失われる。メモの本文は問いの答えを含んでいることが多い
 * （「近所のパン屋は火曜定休」は「定休日は？」の答えそのもの）。
 *
 * 問いを載せるのは、通知を見た時点で想起が始まるためである。
 */

export type NotificationBody = { title: string; body: string; url: string };

/** 通知に必要な最小限。答えとメモ本文は受け取らない。 */
export type FirstQuestion = { question: string };

const MAX_QUESTION_LENGTH = 60;

/**
 * 通知のタップ先。
 *
 * `/` だとメモタブが開く（タブはクライアント状態で、復習を指す URL が
 * 無かった）。通知から復習に入れることが spec の要件なので、タブを
 * 指定できる形にする。app/app-shell.tsx がこの値を読む。
 */
export const REVIEW_URL = "/?tab=review";

export function buildNotification(
  count: number,
  first: FirstQuestion,
): NotificationBody {
  const chars = [...first.question];
  const question =
    chars.length > MAX_QUESTION_LENGTH
      ? chars.slice(0, MAX_QUESTION_LENGTH).join("") + "…"
      : first.question;

  return {
    title: `今日は${count}枚`,
    body: question,
    url: REVIEW_URL,
  };
}
