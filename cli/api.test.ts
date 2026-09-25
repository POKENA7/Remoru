import { describe, expect, it } from "vitest";
import { type ImportItemResult, createApi } from "./api.ts";

/** 通信を差し替えるための偽の fetch。呼び出しを記録する。 */
function fakeFetch(reply: (call: { url: string; init: RequestInit }) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call = { url, init: init ?? {} };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { fn, calls };
}

function body(call: { init: RequestInit }): unknown {
  return JSON.parse(String(call.init.body));
}

describe("createApi", () => {
  it("Bearer トークンを付ける", async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ memos: [] }));
    const api = createApi({ baseUrl: "https://example.test", token: "rem_abc", fetch: fn });

    await api.listMemos({});

    expect(calls[0].url).toBe("https://example.test/api/memos");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer rem_abc");
  });

  it("あて先の末尾のスラッシュを重ねない", async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ tags: [] }));
    const api = createApi({ baseUrl: "https://example.test/", token: "t", fetch: fn });

    await api.listTags();
    expect(calls[0].url).toBe("https://example.test/api/tags");
  });

  it("401 は失敗として返す", async () => {
    const { fn } = fakeFetch(() => Response.json({ error: "unauthorized" }, { status: 401 }));
    const api = createApi({ baseUrl: "https://example.test", token: "bad", fetch: fn });

    expect(await api.listMemos({})).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("本文の配列を POST する", async () => {
    const { fn, calls } = fakeFetch(() =>
      Response.json({ results: [{ ok: true, memoId: "1" }] satisfies ImportItemResult[] }),
    );
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    const result = await api.addMemos(["ひとつめ"]);
    expect(calls[0].init.method).toBe("POST");
    expect(body(calls[0])).toEqual(["ひとつめ"]);
    expect(result).toEqual({ ok: true, results: [{ ok: true, memoId: "1" }] });
  });

  it("20件を超える登録は分けて送る", async () => {
    const { fn, calls } = fakeFetch((call) =>
      Response.json({
        results: (body(call) as string[]).map(
          (_, i) => ({ ok: true, memoId: `x${i}` }) satisfies ImportItemResult,
        ),
      }),
    );
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    const contents = Array.from({ length: 21 }, (_, i) => `memo ${i}`);
    const result = await api.addMemos(contents);

    expect(calls).toHaveLength(2);
    expect(body(calls[0])).toHaveLength(20);
    expect(body(calls[1])).toEqual(["memo 20"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(21);
  });

  it("途中で失敗したら、それまでの結果を添えて返す", async () => {
    let n = 0;
    const { fn } = fakeFetch((call) => {
      n += 1;
      if (n === 1) {
        return Response.json({
          results: (body(call) as string[]).map(() => ({ ok: true, memoId: "1" })),
        });
      }
      return Response.json({ error: "rate_limited" }, { status: 429 });
    });
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    const contents = Array.from({ length: 21 }, (_, i) => `memo ${i}`);
    const result = await api.addMemos(contents);

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "rate_limited",
      results: Array.from({ length: 20 }, () => ({ ok: true, memoId: "1" })),
    });
  });

  it("一覧の絞り込みを問い合わせ文字列にする", async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ memos: [] }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    await api.listMemos({ tag: "tag id", limit: 5 });
    expect(calls[0].url).toBe("https://example.test/api/memos?tag=tag+id&limit=5");
  });

  it("詳細の id を包む", async () => {
    const { fn, calls } = fakeFetch(() => Response.json({ memo: { id: "a/b" } }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    await api.getMemo("a/b");
    expect(calls[0].url).toBe("https://example.test/api/memos/a%2Fb");
  });

  it("詳細の404は失敗として返す", async () => {
    const { fn } = fakeFetch(() => Response.json({ error: "not_found" }, { status: 404 }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    expect(await api.getMemo("missing")).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("詳細の応答の形が違えば失敗にする", async () => {
    const { fn } = fakeFetch(() => Response.json({}));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    expect(await api.getMemo("x")).toEqual({
      ok: false,
      status: 200,
      error: "invalid_response",
    });
  });

  it("JSONでない応答を失敗として扱う", async () => {
    const { fn } = fakeFetch(() => new Response("<html>", { status: 502 }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    expect(await api.listTags()).toEqual({ ok: false, status: 502, error: "http_502" });
  });

  it("タグの一覧を返す", async () => {
    const { fn } = fakeFetch(() => Response.json({ tags: [{ id: "t1", name: "店", count: 2 }] }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    expect(await api.listTags()).toEqual({
      ok: true,
      data: [{ id: "t1", name: "店", count: 2 }],
    });
  });

  it("結果の件数が合わない応答は失敗にする", async () => {
    // 本文と結果を添字で突き合わせるので、欠けた応答は取り違えになる
    const { fn } = fakeFetch(() => Response.json({ results: [] }));
    const api = createApi({ baseUrl: "https://example.test", token: "t", fetch: fn });

    expect(await api.addMemos(["ひとつめ"])).toEqual({
      ok: false,
      status: 200,
      error: "invalid_response",
      results: [],
    });
  });
});
