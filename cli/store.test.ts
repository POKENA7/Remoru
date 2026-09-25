import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearToken, configDir, readToken, tokenPath, writeToken } from "./store.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "remoru-cli-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  it("REMORU_CONFIG_DIR があればそこを使う", () => {
    expect(configDir({ REMORU_CONFIG_DIR: dir })).toBe(dir);
    expect(tokenPath({ REMORU_CONFIG_DIR: dir })).toBe(join(dir, "token"));
  });

  it("保存したトークンを読める", () => {
    writeToken("rem_abc", { REMORU_CONFIG_DIR: dir });
    expect(readToken({ REMORU_CONFIG_DIR: dir })).toBe("rem_abc");
  });

  it("トークンが無ければ null", () => {
    expect(readToken({ REMORU_CONFIG_DIR: dir })).toBeNull();
  });

  it("消せる", () => {
    writeToken("rem_abc", { REMORU_CONFIG_DIR: dir });
    clearToken({ REMORU_CONFIG_DIR: dir });
    expect(readToken({ REMORU_CONFIG_DIR: dir })).toBeNull();
  });

  it("他人に読めない権限で置く", () => {
    // 取り込みを許す鍵なので、置き場は本人だけが読めるようにする
    writeToken("rem_abc", { REMORU_CONFIG_DIR: dir });
    expect(statSync(tokenPath({ REMORU_CONFIG_DIR: dir })).mode & 0o077).toBe(0);
  });

  it("緩い権限のファイルを上書きしても締め直す", () => {
    // `writeFileSync` の mode は新規作成のときだけ効く
    writeToken("rem_abc", { REMORU_CONFIG_DIR: dir });
    chmodSync(tokenPath({ REMORU_CONFIG_DIR: dir }), 0o644);

    writeToken("rem_def", { REMORU_CONFIG_DIR: dir });
    expect(statSync(tokenPath({ REMORU_CONFIG_DIR: dir })).mode & 0o077).toBe(0);
  });

  it("前後の空白を落として読む", () => {
    writeToken("rem_abc", { REMORU_CONFIG_DIR: dir });
    expect(readToken({ REMORU_CONFIG_DIR: dir })).toBe("rem_abc");
  });
});
