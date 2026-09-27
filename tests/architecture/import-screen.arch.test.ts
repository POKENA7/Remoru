import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * メモの一覧が取り込みトークンを読まないことを固定する（design D10）。
 *
 * 以前は一覧の描画のたびに `getImportToken()` を呼び、上部のボタンから
 * シートへ渡していた。開く人の少ない画面のために、全員の初期表示に取得を
 * 1つ足していた。**静かに戻る種類の変更**である——「設定への入口を一覧にも」
 * と言われれば1行で戻る。戻すときは design を先に変えてほしい。ここが落ちたら
 * その合図。
 *
 * 入口は `memo-tab.tsx` の `UserButton.Link` だけにした（design D10）。
 * `features/import` の import が一覧側に現れたら、それは取得が戻ったか、
 * 画面が戻ったかのどちらかである。
 */

const ROOT = process.cwd();

/** import 指定子を全部拾う。type import も side-effect import も含める。 */
function specifiers(src: string): string[] {
  const found: string[] = [];
  for (const re of [
    /^\s*import\s+[^;]*?from\s+["']([^"']+)["']/gm,
    /^\s*import\s+["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const m of src.matchAll(re)) found.push(m[1]);
  }
  return found;
}

function importsFeatureImport(path: string): boolean {
  return specifiers(readFileSync(path, "utf8")).some((s) => s.includes("features/import"));
}

describe("メモの一覧は取り込みトークンを読まない", () => {
  it("/settings/api の画面がある", () => {
    expect(existsSync(join(ROOT, "app", "(app)", "settings", "api", "page.tsx"))).toBe(true);
  });

  it("一覧の Container が features/import を import していない", () => {
    const container = join(ROOT, "app", "(app)", "_containers", "memo-list", "container.tsx");
    expect(existsSync(container)).toBe(true);
    expect(importsFeatureImport(container)).toBe(false);
  });

  it("メモ画面とタブが features/import を import していない", () => {
    for (const name of ["memo-screen.tsx", "memo-tab.tsx"]) {
      const path = join(ROOT, "features", "memo", "components", name);
      expect(existsSync(path), name).toBe(true);
      expect(importsFeatureImport(path), name).toBe(false);
    }
  });
});
