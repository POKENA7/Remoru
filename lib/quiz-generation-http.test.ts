import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ANTHROPIC_VERSION,
  ENDPOINT,
  callAnthropic,
} from "./quiz-generation-client";
import { QUIZ_TOOL_NAME, buildGenerationInput } from "./quiz-generation";

/**
 * **本物の呼び出しを実行するテスト。**
 *
 * 偽の呼び先を渡すテスト（quiz-generation-client.test.ts）は、置き換えた
 * 本物を一度も動かさない。経路・ヘッダ名・状態の判断を誤っても全て緑の
 * まま、本番で 401 になり、失敗は設計上画面に出ない（design.md D6）。
 * change 4 で同じ形の見落としを踏んでいる。
 *
 * ここでは fetch だけを偽物にして、送っている中身と応答の扱いを見る。
 */

type FetchArgs = { url: string; init: RequestInit };

function stubFetch(respond: () => Response) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return respond();
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Anthropic への要求", () => {
  it("経路・ヘッダ・本文を正しく組み立てる", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ content: [] }), { status: 200 }));

    await callAnthropic(buildGenerationInput("近所のパン屋は火曜定休"), "sk-test");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toMatch(/^claude-/);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toEqual({ type: "tool", name: QUIZ_TOOL_NAME });
    expect(JSON.stringify(body)).toContain("近所のパン屋は火曜定休");
  });

  it("応答が届かなくなったときのために上限を付けている", async () => {
    const calls = stubFetch(() => new Response("{}", { status: 200 }));
    await callAnthropic({}, "sk-test");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("成功したら本文を解釈して返す", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", name: QUIZ_TOOL_NAME }] }), {
        status: 200,
      }),
    );

    const result = await callAnthropic({}, "sk-test");
    expect(result).toEqual({ content: [{ type: "tool_use", name: QUIZ_TOOL_NAME }] });
  });

  it("失敗の応答は例外にする。状態番号だけを載せ、本文は読まない", async () => {
    for (const status of [400, 401, 429, 500, 529]) {
      stubFetch(() => new Response("鍵が違います", { status }));
      await expect(callAnthropic({}, "sk-test")).rejects.toThrow(String(status));
      // 本文には鍵や要求の内容が混ざりうるので、記録に持ち出さない
      await expect(callAnthropic({}, "sk-test")).rejects.not.toThrow(/鍵が違います/);
      vi.unstubAllGlobals();
    }
  });
});
