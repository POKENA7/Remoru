import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUGGEST_TOOL_NAME } from "./tag-suggestion";
import {
  ANTHROPIC_VERSION,
  type CallModel,
  callAnthropic,
  ENDPOINT,
  suggestTags,
} from "./tag-suggestion-client";

const MEMOS = [
  { id: "m1", content: "会議は毎週水曜10時" },
  { id: "m2", content: "積読が3冊たまっている" },
];

function toolResponse(assignments: unknown) {
  return { content: [{ type: "tool_use", name: SUGGEST_TOOL_NAME, input: { assignments } }] };
}

function recorder(result: unknown | (() => never)) {
  const calls: { input: unknown; apiKey: string }[] = [];
  const call: CallModel = async (input, apiKey) => {
    calls.push({ input, apiKey });
    if (typeof result === "function") return (result as () => never)();
    return result;
  };
  return { calls, call };
}

/** 偽の呼び先を渡すテストが、本当にネットワークに出ていないことを見張る。 */
let fetchCalls = 0;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchCalls = 0;
  vi.stubGlobal("fetch", (...args: unknown[]) => {
    fetchCalls += 1;
    throw new Error(`ネットワークに出た: ${String(args[0])}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("提案の呼び出し", () => {
  it("成功すると提案を返す", async () => {
    const { calls, call } = recorder(
      toolResponse([
        { memoId: "m1", tag: "仕事" },
        { memoId: "m2", tag: "読書" },
      ]),
    );

    const result = await suggestTags(MEMOS, ["仕事"], { apiKey: "key", call });

    expect(result).toEqual({
      ok: true,
      assignments: [
        { memoId: "m1", tag: "仕事" },
        { memoId: "m2", tag: "読書" },
      ],
    });
    expect(fetchCalls).toBe(0);
  });

  it("呼び出しが失敗しても例外にしない", async () => {
    const { call } = recorder(() => {
      throw new Error("500");
    });
    expect(await suggestTags(MEMOS, [], { apiKey: "key", call })).toEqual({
      ok: false,
      reason: "request_failed",
    });
  });

  it("採用できる提案が1つも無ければ失敗にする", async () => {
    const { call } = recorder(toolResponse([{ memoId: "知らないメモ", tag: "仕事" }]));
    expect(await suggestTags(MEMOS, [], { apiKey: "key", call })).toEqual({
      ok: false,
      reason: "invalid_output",
    });
  });

  it("鍵が無ければ呼び出さない", async () => {
    const { calls, call } = recorder(toolResponse([{ memoId: "m1", tag: "仕事" }]));
    for (const apiKey of [undefined, null, ""]) {
      expect(await suggestTags(MEMOS, [], { apiKey, call })).toEqual({
        ok: false,
        reason: "no_key",
      });
    }
    expect(calls).toEqual([]);
  });

  it("未分類が無ければ呼び出さない", async () => {
    const { calls, call } = recorder(toolResponse([]));
    expect(await suggestTags([], [], { apiKey: "key", call })).toEqual({
      ok: true,
      assignments: [],
    });
    expect(calls).toEqual([]);
  });

  it("メモ本文と鍵を記録に出さない", async () => {
    const errors = vi.spyOn(console, "error");
    const { call } = recorder(() => {
      throw new Error("500");
    });

    await suggestTags(MEMOS, [], { apiKey: "key", call });

    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain("会議は毎週水曜");
    expect(logged).not.toContain("key");
  });
});

/**
 * **本物の呼び出しを実行するテスト。**
 *
 * change 5 のレビューで、偽の呼び先を渡すテストしか無いために経路も
 * ヘッダ名も一度も動いていない、という指摘を受けた（中-1）。同じ形を
 * 繰り返さないよう、fetch だけを偽物にして本物を通す。
 */
describe("Anthropic への要求", () => {
  function stubFetch(respond: () => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
      return respond();
    });
    return calls;
  }

  it("経路・ヘッダ・本文を正しく組み立てる", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ content: [] }), { status: 200 }));

    await callAnthropic({ model: "claude-haiku-4-5-20251001", hello: "world" }, "sk-test");

    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(calls[0].init.body)).hello).toBe("world");
  });

  it("失敗の応答は例外にする。状態番号だけを載せる", async () => {
    stubFetch(() => new Response("鍵が違います", { status: 401 }));
    await expect(callAnthropic({}, "sk-test")).rejects.toThrow("401");
    await expect(callAnthropic({}, "sk-test")).rejects.not.toThrow(/鍵が違います/);
  });
});
