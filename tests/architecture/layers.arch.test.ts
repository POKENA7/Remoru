import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 層の向きを固定する（component-directories）。
 *
 * 依存は一方通行である。
 *
 *   app/ → features/ → lib/
 *
 * `features/` が `app/` を参照した瞬間に循環ができる。実際、部品を
 * `app/` から `features/` へ移したとき、`tag-suggestion-band.tsx` が
 * 型を `@/app/app-shell` から取り続けており、**app-shell がその部品を
 * import しているので循環参照になっていた**。レビューで指摘されるまで
 * 気づかなかったので、検査にする。
 */

const ROOT = process.cwd();

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        out.push(full);
      }
    }
  };
  walk(join(ROOT, dir));
  return out;
}

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

describe("依存は app → features → lib の一方通行", () => {
  const FEATURES = sources("features");
  const LIB = sources("lib");
  const HOOKS = sources("hooks");

  it("走査対象が空でない", () => {
    expect(FEATURES.length).toBeGreaterThan(20);
    expect(LIB.length).toBeGreaterThan(2);
  });

  for (const [label, files] of [
    ["features", FEATURES],
    ["lib", LIB],
    ["hooks", HOOKS],
  ] as const) {
    it(`${label}/ は app/ を参照しない`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const bad = specifiers(readFileSync(f, "utf8")).filter(
          (s) => s.startsWith("@/app/") || /(^|\/)\.\.\/app\//.test(s),
        );
        if (bad.length > 0) offenders.push(`${f.slice(ROOT.length + 1)}: ${bad.join(", ")}`);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("lib/ は features/ を参照しない", () => {
    // lib は外部ライブラリのラッパーだけ。機能を知ってはいけない
    const offenders: string[] = [];
    for (const f of LIB) {
      const bad = specifiers(readFileSync(f, "utf8")).filter((s) => s.startsWith("@/features/"));
      if (bad.length > 0) offenders.push(`${f.slice(ROOT.length + 1)}: ${bad.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
