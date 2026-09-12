import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/**
 * `check:bundle` が予算超過で赤くなることの検査（L06 / measure-first-paint 1.3）。
 *
 * 「予算内なら 0」だけでは**常に緑の検査**が通り、「超過で非ゼロ」だけでは
 * **常に赤い検査**が通る。両方見て初めて検査になる（`checks.test.ts` と同じ考え方）。
 *
 * 入力は**その場で組み立てた `.next`** にする。本物の `.next` に頼ると、
 * ビルドしていない環境（CI の `check:test` は `check:build` より先に走る）で
 * 検査が消えてしまい、「緑だから通った」のか「走らなかった」のかが区別できない。
 *
 * 組み立てた `.next` は、チャンクを **2 か所に分けて**置く。`rootMainFiles` 側と
 * `page_client-reference-manifest.js` 側である。合計が両方の和になることを見るので、
 * script がどちらか片方を読まなくなれば、この検査が赤くなる。
 */

const SCRIPT = join(dirname(new URL(import.meta.url).pathname), "bundle-budget.mjs");
const ROOT = process.cwd();

/** 圧縮しても縮まないよう、擬似乱数で埋めたチャンクの中身を作る */
function chunkSource(seed: number, bytes: number): string {
  let s = "";
  let x = seed;
  while (s.length < bytes) {
    x = (x * 1103515245 + 12345) % 2147483648;
    s += x.toString(36);
  }
  return s.slice(0, bytes);
}

type Fixture = { dir: string; nextDir: string; rootBytes: number; pageBytes: number };

/**
 * `next build` の出力のうち、script が読む 3 つのファイルだけを持つ `.next` を作る。
 *
 * 経路は `/`（app のパスは `/(app)/page`）。本物と同じ形にしてあるので、
 * script 側が読む場所を変えればここが落ちる。
 */
function buildFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "bundle-budget-"));
  const nextDir = join(dir, ".next");
  const chunks = join(nextDir, "static", "chunks");
  mkdirSync(chunks, { recursive: true });
  mkdirSync(join(nextDir, "server", "app", "(app)"), { recursive: true });

  const write = (name: string, seed: number, bytes: number) => {
    const body = chunkSource(seed, bytes);
    writeFileSync(join(chunks, name), body);
    return gzipSync(Buffer.from(body), { level: 9 }).length;
  };

  // 全経路共通の枠（rootMainFiles）と、`/` 固有の Client Component（client manifest）
  const rootBytes = write("root-a.js", 1, 40_000) + write("root-b.js", 2, 20_000);
  const pageBytes = write("page-a.js", 3, 30_000);
  // polyfill は**どちらにも属さない独立のファイル**にする。`rootMainFiles` と同じ
  // ファイルを指すと Set が重複除去してしまい、足しても合計が変わらない。
  // それでは「足していないこと」を何も見ていない
  write("polyfill.js", 4, 25_000);

  writeFileSync(
    join(nextDir, "build-manifest.json"),
    JSON.stringify({
      rootMainFiles: ["static/chunks/root-a.js", "static/chunks/root-b.js"],
      // 入っていても足されないことを確かめる（本番の `<script>` は noModule）
      polyfillFiles: ["static/chunks/polyfill.js"],
    }),
  );
  writeFileSync(
    join(nextDir, "app-path-routes-manifest.json"),
    JSON.stringify({ "/(app)/page": "/" }),
  );
  writeFileSync(
    join(nextDir, "server", "app", "(app)", "page_client-reference-manifest.js"),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/(app)/page"] = ${JSON.stringify(
      {
        moduleLoading: { prefix: "", crossOrigin: "none" },
        clientModules: {
          "[project]/features/memo/components/memo-list.tsx": {
            id: 1,
            name: "*",
            chunks: ["/_next/static/chunks/page-a.js"],
            async: false,
          },
        },
      },
    )};\n`,
  );

  return { dir, nextDir, rootBytes, pageBytes };
}

/** 予算ファイルを書いて script を走らせる */
function runWithBudget(fixture: Fixture, budget: number) {
  const budgetFile = join(fixture.dir, "budget.json");
  writeFileSync(budgetFile, JSON.stringify({ routes: { "/": budget } }));
  const r = spawnSync("node", [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BUNDLE_BUDGET_FILE: budgetFile,
      BUNDLE_BUDGET_NEXT_DIR: fixture.nextDir,
    },
  });
  return { status: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("check:bundle は予算を超えると赤くなる（L06）", () => {
  it("予算を実測より小さくすると非ゼロで終わり、戻すと 0 で終わる", () => {
    const fixture = buildFixture();
    try {
      const total = fixture.rootBytes + fixture.pageBytes;

      const tooSmall = runWithBudget(fixture, total - 1);
      expect(tooSmall.status).not.toBe(0);

      const enough = runWithBudget(fixture, total);
      expect(enough.status).toBe(0);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it("超えたときはチャンクごとの内訳を出す（どれが太ったか分からないと直せない）", () => {
    const fixture = buildFixture();
    try {
      const over = runWithBudget(fixture, 1);
      expect(over.status).not.toBe(0);
      expect(over.out).toContain("static/chunks/root-a.js");
      expect(over.out).toContain("static/chunks/root-b.js");
      expect(over.out).toContain("static/chunks/page-a.js");
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it("合計は rootMainFiles と client manifest の和集合で、polyfill は含まない", () => {
    const fixture = buildFixture();
    try {
      const total = fixture.rootBytes + fixture.pageBytes;
      // 片方しか読んでいなければ、この 2 つのどちらかが期待と食い違う
      expect(runWithBudget(fixture, total).status).toBe(0);
      expect(runWithBudget(fixture, total - 1).status).not.toBe(0);
      expect(runWithBudget(fixture, total).out).toContain("3 チャンク");
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});

/**
 * 本物の `.next` に対する検査。`check:build` より先に `check:test` が走る環境では
 * `.next` が無いので、そのときは飛ばす（飛ばしたことが出力に残る）。
 *
 * 予算ファイルが**いま置かれている経路を実際に測れる**ことを見る。組み立てた
 * `.next` だけだと、本物のビルド結果の形が変わったときに気づけない。
 */
describe("本物のビルド結果に対して走る", () => {
  const built = existsSync(join(ROOT, ".next", "build-manifest.json"));

  it.skipIf(!built)("予算ファイルの経路をすべて測れて、予算以内である", () => {
    const r = spawnSync("npm", ["run", "--silent", "check:bundle"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const budgets = JSON.parse(
      readFileSync(join(ROOT, "scripts", "harness", "bundle-budget.json"), "utf8"),
    ) as { routes: Record<string, number> };
    for (const route of Object.keys(budgets.routes)) {
      expect(r.stdout).toContain(`${route}  実測 `);
    }
    expect(r.status).toBe(0);
  });
});
