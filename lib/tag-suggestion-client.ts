import {
  type Assignment,
  buildSuggestionInput,
  extractAssignments,
  targetsOf,
} from "./tag-suggestion";

/**
 * タグの提案のうち、外に出る部分。
 *
 * change 5 の lib/quiz-generation-client.ts と同じ形。呼び先を差し替え
 * られるようにしつつ、**実際の呼び先も export してテストから動かす**
 * （change 5 のレビュー指摘 中-1 を繰り返さない）。
 */

export const ENDPOINT = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** 上流が応答を返さないとき、実行の枠を占有し続けないための上限。 */
const REQUEST_TIMEOUT_MS = 30_000;

export type SuggestionFailure = "no_key" | "request_failed" | "invalid_output";

export type SuggestionOutcome =
  | { ok: true; assignments: Assignment[] }
  | { ok: false; reason: SuggestionFailure };

export type CallModel = (input: unknown, apiKey: string) => Promise<unknown>;

export async function callAnthropic(input: unknown, apiKey: string): Promise<unknown> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // 本文は読まない。鍵や要求の内容が記録に混ざりうる。
    throw new Error(`提案の要求が失敗した: ${response.status}`);
  }
  return await response.json();
}

/**
 * 未分類のメモにタグを提案させる。
 *
 * 鍵が無ければ**呼び出さない**。提案が使えない環境でも、メモ・タグ・
 * 絞り込み・復習は通常どおり使える（design.md D11）。
 */
export async function suggestTags(
  memos: { id: string; content: string }[],
  existingTagNames: string[],
  options: { apiKey: string | undefined | null; call?: CallModel },
): Promise<SuggestionOutcome> {
  const { apiKey, call = callAnthropic } = options;

  if (!apiKey) return { ok: false, reason: "no_key" };
  if (memos.length === 0) return { ok: true, assignments: [] };

  // **照合に使う id は、実際に渡したものだけ。** 切り詰める前の一覧で
  // 照合すると、プロンプトに入っていないメモへの提案まで受け入れてしまう。
  const targets = targetsOf(memos);

  let response: unknown;
  try {
    response = await call(buildSuggestionInput(memos, existingTagNames), apiKey);
  } catch (error) {
    console.error("タグの提案に失敗した", error);
    return { ok: false, reason: "request_failed" };
  }

  const assignments = extractAssignments(
    response,
    targets.map((m) => m.id),
  );
  if (assignments.length === 0) {
    console.error("タグの提案の応答を採用できなかった");
    return { ok: false, reason: "invalid_output" };
  }

  return { ok: true, assignments };
}
