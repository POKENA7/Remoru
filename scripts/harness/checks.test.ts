import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

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
 * `check:lint` / `check:format` に `--max-diagnostics=none` が付いているのは、
 * これがあってこそ成り立つ検査だからである。既定の 20 件で打ち切られると、
 * 恒常的に出ている警告 24 件の陰に注入したファイルが隠れ、報告されなくなる
 * （CI で実際に落ちた）。**検査が指摘を隠すなら、それは検査ではない。**
 *
 * 置き場が `harness-tmp`（先頭のドット無し）なのは、TypeScript の `**` が
 * **ドットで始まるディレクトリを辿らない**ため。`.harness-tmp` に置いたとき、
 * check:format と check:lint は赤くなったのに check:types だけ緑のままだった。
 *
 * その下をさらにプロセスごとに分け、注入するファイル名にも pid を入れてある
 * （stabilize-harness-tests E4）。門が `check:test` を走らせるので **vitest の
 * 中から vitest が走る**場面が実際にあり、置き場を共有していると、相手の
 * 注入ファイルを自分のものと取り違える・後始末で相手の分まで消す、の両方が
 * 起きる。どちらも「検査が違反を見逃した」以外の理由で赤くする（制約 A 違反）。
 */

const ROOT = process.cwd();
const TMP_PARENT = join(ROOT, "harness-tmp");
/** このプロセス専用の置き場。同時に走る別の vitest とはここで分かれる */
const TMP_ROOT = join(TMP_PARENT, `p${process.pid}`);

/** 検査を 1 つ走らせて終了コードと出力を返す。赤いのは想定内なので出力も見る */
function runCheck(script: string): { status: number; out: string } {
  const r = spawnSync("npm", ["run", "--silent", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * 壊したファイルを置いた状態と、取り除いた状態の結果を返す。
 *
 * 置き場は毎回別にする。`check:*` はリポジトリ全体を走査するので、同じ場所を
 * 使うと**同時に走った別の検査**の注入ファイルを拾う。門（PreToolUse）は
 * `check:test` を走らせるため、vitest の中から vitest が走る場面が実際にある。
 *
 * **ファイル名にも pid を入れる。** 置き場を分けるだけでは足りない。判定は
 * 出力にファイル名が現れるかで見ているので、名前が同じだと、別プロセスの
 * 注入ファイルを自分のものとして数えてしまう（「取り除いたのに出力に残る」
 * 側で偽の赤になる）。
 */
function withInjected(baseName: string, source: string, script: string) {
  const fileName = baseName.replace(/\.ts$/, `-p${process.pid}.ts`);
  mkdirSync(TMP_ROOT, { recursive: true });
  const dir = mkdtempSync(join(TMP_ROOT, "inject-"));
  writeFileSync(join(dir, fileName), source);
  const injected = runCheck(script);
  rmSync(dir, { recursive: true, force: true });
  const clean = runCheck(script);
  return { injected, clean, fileName };
}

/**
 * 注入したファイルを名指しで報告し、取り除くと報告しなくなることを見る。
 *
 * 「取り除いたら終了コードが 0」ではなく「そのファイルを挙げなくなった」を
 * 見るのは、リポジトリの他の場所が赤いときに巻き込まれないため。
 */
function expectDetects(r: ReturnType<typeof withInjected>) {
  expect(r.injected.status).not.toBe(0);
  expect(r.injected.out).toContain(r.fileName);
  expect(r.clean.out).not.toContain(r.fileName);
}

afterEach(() => {
  // 消すのは**自分の分だけ**。`harness-tmp` を丸ごと消すと、同時に走っている
  // 別の vitest の注入ファイルを検査の途中で取り上げてしまう
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

afterAll(() => {
  // 親は空のときだけ片付ける。残すと `check:*` の入力に入り続ける。
  // 他のプロセスの置き場が残っていれば ENOTEMPTY で失敗するので、そのままにする
  try {
    rmdirSync(TMP_PARENT);
  } catch {
    // 空でない（＝別プロセスがまだ使っている）か、そもそも無い
  }
});

describe("壊した入力を食わせると赤くなる（D10）", () => {
  it("check:format は整形されていないファイルで落ちる", () => {
    expectDetects(
      withInjected(
        "unformatted.ts",
        "export const a   =    1;\n    export const b=2\n",
        "check:format",
      ),
    );
  });

  it("check:lint は lint 違反を含むファイルで落ちる", () => {
    // noDebugger / noSelfCompare はどちらも recommended の error。
    // warn に落とした 8 ルール（biome.json）を使うと、緑のまま通ってしまう
    expectDetects(
      withInjected(
        "linted.ts",
        "export function probe(x: number) {\n  if (x === x) {\n    debugger;\n  }\n  return x;\n}\n",
        "check:lint",
      ),
    );
  });

  it("check:types は型の合わないファイルで落ちる", () => {
    expectDetects(withInjected("typed.ts", 'export const n: number = "文字列";\n', "check:types"));
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
