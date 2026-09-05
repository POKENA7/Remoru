import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 読み取りの入口（`features/<機能>/queries.ts`）の形を固定する。
 *
 * design.md D8: Server Components が呼ぶのは `queries.ts` だけで、そこが
 * 認証と D1 の取り出しを引き受ける。ドメイン関数は `(db, userId, …)` の
 * 純関数のままにする。
 *
 * **この検査はファイルを読むだけで、import しない。** `queries.ts` は
 * `server-only` を持つので、node で走る vitest からは import できない
 * （`react-server` 条件が無い環境では throw する側が選ばれる）。
 * 同じ理由で `cache()` のメモ化も node では効かないため、
 * 「本当に 1 回しか問い合わせないか」はここでは見られない。
 * それは画面を描いて実行で確かめる（design D8）。
 */

const ROOT = process.cwd();
const FEATURES = join(ROOT, "features");

function featureDirs(): string[] {
  return readdirSync(FEATURES).filter((d) => existsSync(join(FEATURES, d, "queries.ts")));
}

/** コメントを除いた本体だけを返す。言及と使用を区別するため。 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const QUERIES = featureDirs().map((d) => ({
  name: `features/${d}/queries.ts`,
  code: codeOnly(readFileSync(join(FEATURES, d, "queries.ts"), "utf8")),
}));

describe("読み取りの入口", () => {
  it("走査対象が空でない", () => {
    // 置き場を間違えて 0 件になっても、下の検査は緑になってしまう
    expect(QUERIES.length).toBeGreaterThan(3);
  });

  for (const { name, code } of QUERIES) {
    it(`${name} は server-only を宣言している`, () => {
      // クライアントバンドルへ D1 が流れ込むのをビルドで止める（design D7）
      expect(code).toMatch(/import\s+["']server-only["']/);
    });

    it(`${name} が公開するものは全部 cache() で包まれている`, () => {
      // `export const x = cache(...)` 以外の公開を許さない。
      // 包み忘れると Container を分けた分だけ問い合わせが増える
      const exported = [...code.matchAll(/^export\s+(?:const|async function|function)\s+(\w+)/gm)];
      expect(exported.length).toBeGreaterThan(0);

      const unwrapped = exported
        .filter((m) => {
          const line = code.slice(m.index ?? 0, (m.index ?? 0) + 200);
          return !/^export\s+const\s+\w+\s*=\s*cache\(/.test(line);
        })
        .map((m) => m[1]);

      expect(unwrapped).toEqual([]);
    });

    it(`${name} は時計を直に読まない`, () => {
      // 取得関数ごとに Date.now() を読むと、同じ画面の中で違う時刻を見る。
      // 日境界をまたいだときだけ噛み合わない数が出る（L07）
      expect(code).not.toMatch(/Date\.now\(\)/);
    });

    it(`${name} は認証を自分で確かめている`, () => {
      // 画面側が呼び忘れても、データが出ない側に倒れる（design D8）
      expect(code).toMatch(/verifySession\(\)/);
    });
  }

  it("lib/db.ts は server-only を宣言している", () => {
    // D1 バインディングの取り出し口。ここが漏れると読み取りの入口を
    // 迂回してクライアントから触れてしまう
    const code = codeOnly(readFileSync(join(ROOT, "lib", "db.ts"), "utf8"));
    expect(code).toMatch(/import\s+["']server-only["']/);
  });

  /**
   * cron worker は Next.js のアプリではない。`server-only` を持つモジュールを
   * 読むと、Workers のビルドでは throw する側が解決されて起動しなくなる。
   *
   * **型検査では出ない**（`server-only` は実行時に投げる）ので、ここで見る。
   */
  const CRON_READS = [
    "features/notification/push.ts",
    "features/notification/notification-timing.ts",
    "features/notification/notification-message.ts",
    "features/review/review-scheduler.ts",
  ];

  for (const rel of CRON_READS) {
    it(`${rel} は cron worker が読むので server-only を持たない`, () => {
      const code = codeOnly(readFileSync(join(ROOT, rel), "utf8"));
      expect(code).not.toMatch(/import\s+["']server-only["']/);
    });
  }

  it("cron worker が読むモジュールの一覧が実態と合っている", () => {
    // 上のリストが古くなると、守っているつもりで守らなくなる
    const cronSrc = join(ROOT, "cron-worker", "src");
    const referenced = new Set<string>();
    for (const f of readdirSync(cronSrc)) {
      if (!f.endsWith(".ts")) continue;
      const src = readFileSync(join(cronSrc, f), "utf8");
      for (const m of src.matchAll(/from\s+["']\.\.\/\.\.\/(features\/[\w-]+\/[\w-]+)["']/g)) {
        referenced.add(`${m[1]}.ts`);
      }
    }
    for (const rel of referenced) {
      expect(CRON_READS).toContain(rel);
    }
  });
});
