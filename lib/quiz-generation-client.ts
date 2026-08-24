import { buildGenerationInput, extractQuiz } from "./quiz-generation";

/**
 * 問答の生成のうち、外に出る部分。
 *
 * 呼び先を差し替えられる形にしてある。テストは偽の呼び先を渡し、
 * ネットワークに出ずに成功・失敗・壊れた応答を確かめる（change 4 の
 * 配信と同じ形）。
 *
 * 公式 SDK ではなく素の fetch を使う。change 4 で `web-push` が Node 専用で
 * Workers では動かないことを踏んだ。Messages API は1回の POST で足りる。
 */

export const ENDPOINT = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type GenerationFailure = "no_key" | "request_failed" | "invalid_output";

export type GenerationOutcome =
  | { ok: true; question: string; answer: string }
  | { ok: false; reason: GenerationFailure };

/** モデルを1回呼ぶ関数。実体は下の `callAnthropic`。 */
export type CallModel = (input: unknown, apiKey: string) => Promise<unknown>;

/** 上流が応答を返さないとき、実行の枠を占有し続けないための上限。 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * 実際に Anthropic へ1回投げる。
 *
 * **export しているのはテストのため。** 偽の呼び先を渡すテストだけだと、
 * 経路・ヘッダ名・状態の判断がどのテストからも実行されない。change 4 で
 * 同じ形の見落としを踏んでいる（lib/push.ts の classifyResponse を参照）。
 */
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
    throw new Error(`生成の要求が失敗した: ${response.status}`);
  }
  return await response.json();
}

/**
 * メモ1件から問と答を作る。
 *
 * 鍵が無ければ**呼び出さない**（design.md D7）。ローカル開発や鍵の
 * 入れ替え中に、メモの投入そのものが壊れないようにする。
 *
 * 失敗は例外にしない。呼び出し側は「未作成に落とす」以外の分岐を持たない。
 */
export async function generateQuiz(
  content: string,
  options: { apiKey: string | undefined | null; call?: CallModel },
): Promise<GenerationOutcome> {
  const { apiKey, call = callAnthropic } = options;

  if (!apiKey) return { ok: false, reason: "no_key" };

  let response: unknown;
  try {
    response = await call(buildGenerationInput(content), apiKey);
  } catch (error) {
    // 生成が常に失敗しているのに気づけない状態を作らない（design.md D6）。
    // メモの本文は出さない。
    console.error("問答の生成に失敗した", error);
    return { ok: false, reason: "request_failed" };
  }

  const extracted = extractQuiz(response);
  if (!extracted.ok) {
    console.error("問答の生成の応答を採用できなかった", extracted.error);
    return { ok: false, reason: "invalid_output" };
  }

  return { ok: true, question: extracted.question, answer: extracted.answer };
}
