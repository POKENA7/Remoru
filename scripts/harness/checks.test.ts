import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * 検査が壊れた入力で赤くなることの検査（design.md D10 / L06 の昇格）。
 *
 * L06「検査は、違反をわざと入れて赤くなるまで検査ではない」は 24 回引用され
 * ながら散文のままだった。ここが実行可能な層への移し先である。
 *
 * 各検査に**わざと壊した一時ファイル**を食わせて非ゼロ終了することと、
 * 取り除くと 0 に戻ることの両方を見る。前者だけだと「常に赤い検査」も通り、
 * 後者だけだと「常に緑の検査」も通る。両方あって初めて検査になる。
 *
 * 一時ファイルはリポジトリの中に置く。`check:*` はリポジトリ全体を走査する
 * ので、外に置くと入力に入らない（scan-secrets.sh で踏んだ L09 と同じ罠）。
 *
 * 置き場が `harness-tmp`（先頭のドット無し）なのは、TypeScript の `**` が
 * **ドットで始まるディレクトリを辿らない**ため。`.harness-tmp` に置いたとき、
 * check:format と check:lint は赤くなったのに check:types だけ緑のままだった。
 */

const ROOT = process.cwd();
const TMP = join(ROOT, "harness-tmp");

/** 検査を 1 つ走らせて終了コードを返す。出力は捨てる（赤いのは想定内なので） */
function runCheck(script: string): number {
  const r = spawnSync("npm", ["run", "--silent", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.status ?? -1;
}

/** 壊したファイルを置いた状態と、取り除いた状態の終了コードを返す */
function withInjected(fileName: string, source: string, script: string) {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, fileName), source);
  const injected = runCheck(script);
  rmSync(TMP, { recursive: true, force: true });
  const clean = runCheck(script);
  return { injected, clean };
}

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("壊した入力を食わせると赤くなる（D10）", () => {
  it("check:format は整形されていないファイルで落ちる", () => {
    const { injected, clean } = withInjected(
      "unformatted.ts",
      "export const a   =    1;\n    export const b=2\n",
      "check:format",
    );
    expect(injected).not.toBe(0);
    expect(clean).toBe(0);
  });

  it("check:lint は lint 違反を含むファイルで落ちる", () => {
    // noDebugger / noSelfCompare はどちらも recommended の error。
    // warn に落とした 8 ルール（biome.json）を使うと、緑のまま通ってしまう
    const { injected, clean } = withInjected(
      "linted.ts",
      "export function probe(x: number) {\n  if (x === x) {\n    debugger;\n  }\n  return x;\n}\n",
      "check:lint",
    );
    expect(injected).not.toBe(0);
    expect(clean).toBe(0);
  });

  it("check:types は型の合わないファイルで落ちる", () => {
    const { injected, clean } = withInjected(
      "typed.ts",
      'export const n: number = "文字列";\n',
      "check:types",
    );
    expect(injected).not.toBe(0);
    expect(clean).toBe(0);
  });
});

/**
 * check:secrets の注入は、使い捨ての git リポジトリに対して行う（D10 / L09）。
 *
 * `scan-secrets.sh` は git の**全履歴の blob** を走査する。作業ツリーに置いた
 * だけでは入力に入らないので、必ずコミットしてから走らせる。
 *
 * 偽の鍵は実行時に組み立てる。ソースに `CLERK_SECRET_KEY="sk_test_…"` の形で
 * 書くと、**このファイル自身がこのリポジトリの検査に引っかかる**。
 */
describe("check:secrets は履歴に入った鍵の形の値で落ちる（D10 / L09）", () => {
  const KEY_NAME = ["CLERK", "SECRET", "KEY"].join("_");
  const FAKE = `sk_test_${"A1B2C3D4E5F6G7H8"}`;

  /**
   * 使い捨ての git リポジトリを作り、渡された中身を置いて走査する。
   *
   * `commit: false` は**コミット前の門**の経路である。検査 1〜4 は履歴の blob を
   * 入力にするので見つけられない。検査 5（追跡中のファイルの現在の中身）だけが
   * 捕まえる。ここが緑のままだと、public リポジトリに鍵が入る瞬間を素通りさせる。
   */
  function scanThrowawayRepo(content: string, commit = true): number {
    const dir = mkdtempSync(join(tmpdir(), "harness-secrets-"));
    try {
      const git = (...args: string[]) =>
        spawnSync("git", args, { cwd: dir, encoding: "utf8", stdio: "ignore" });
      git("init", "-q");
      git("config", "user.email", "harness@example.invalid");
      git("config", "user.name", "harness");
      writeFileSync(join(dir, "config.ts"), content);
      git("add", "-A");
      if (commit) git("commit", "-q", "-m", "inject");
      const r = spawnSync("bash", [join(ROOT, "scripts", "scan-secrets.sh")], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return r.status ?? -1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("大文字と数字を含む値をコミットすると非ゼロで終わる", () => {
    expect(scanThrowawayRepo(`export const key = { ${KEY_NAME}: "${FAKE}" };\n`)).not.toBe(0);
  });

  it("add しただけでコミットしていない鍵も見つかる（門はコミット前に走る）", () => {
    expect(scanThrowawayRepo(`export const key = { ${KEY_NAME}: "${FAKE}" };\n`, false)).not.toBe(
      0,
    );
  });

  it("プレースホルダだけなら 0 で終わる", () => {
    expect(scanThrowawayRepo(`export const key = { ${KEY_NAME}: "sk_test_replace_me" };\n`)).toBe(
      0,
    );
  });
});
