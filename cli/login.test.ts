import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./api.ts";
import { loginWithToken } from "./login.ts";
import { readToken, writeToken } from "./store.ts";

/**
 * login は**保存する前にトークンを確かめる**（design D7）。
 *
 * ストアを一時ディレクトリに向け、失敗したときに保存しないこと、既に
 * 保存されたトークンを消さないことを確かめる。
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "remoru-login-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 本物の設定を触らないための環境。 */
function env(): NodeJS.ProcessEnv {
  return { REMORU_CONFIG_DIR: dir };
}

/** 通信を差し替える。`reply` が投げれば通信の失敗になる。 */
function fakeFetch(reply: () => Response): typeof fetch {
  return (async (_input: string | URL | Request, _init?: RequestInit) => reply()) as typeof fetch;
}

function apiWith(fetchImpl: typeof fetch) {
  return createApi({ baseUrl: "https://example.test", token: "rem_new", fetch: fetchImpl });
}

describe("loginWithToken", () => {
  it("使えるトークンなら保存する", async () => {
    const result = await loginWithToken(
      apiWith(fakeFetch(() => Response.json({ tags: [] }))),
      "rem_new",
      env(),
    );

    expect(result.ok).toBe(true);
    expect(readToken(env())).toBe("rem_new");
  });

  it("401 なら保存しない", async () => {
    const result = await loginWithToken(
      apiWith(fakeFetch(() => Response.json({ error: "unauthorized" }, { status: 401 }))),
      "rem_bad",
      env(),
    );

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(readToken(env())).toBeNull();
  });

  it("通信の失敗なら保存しない", async () => {
    const result = await loginWithToken(
      apiWith(
        fakeFetch(() => {
          throw new Error("network down");
        }),
      ),
      "rem_new",
      env(),
    );

    expect(result).toEqual({ ok: false, reason: "unreachable" });
    expect(readToken(env())).toBeNull();
  });

  it("確認に失敗しても、既に保存されたトークンを消さない", async () => {
    writeToken("rem_old", env());

    const result = await loginWithToken(
      apiWith(fakeFetch(() => Response.json({ error: "unauthorized" }, { status: 401 }))),
      "rem_bad",
      env(),
    );

    expect(result.ok).toBe(false);
    expect(readToken(env())).toBe("rem_old");
  });
});
