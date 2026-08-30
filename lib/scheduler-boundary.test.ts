import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * design.md D2: スケジューラは HTTP・セッション・データベース・フレームワークの
 * いずれも import しない。依存の向きは一方通行で、他の層がスケジューラを呼ぶ。
 *
 * このプロジェクトにはレビュアーがいないので、規約ではなく検査で守る。
 * ここが落ちたら、境界が壊れたということ。
 */

const SOURCE = readFileSync(join(process.cwd(), "lib", "review-scheduler.ts"), "utf8");

/** import 文が参照しているモジュール名を全部拾う */
function importedModules(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /^\s*import\s+[^;]*?from\s+["']([^"']+)["']/gm,
    /^\s*import\s+["']([^"']+)["']/gm,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.push(m[1]);
  }
  return found;
}

const FORBIDDEN = [
  { label: "Next.js", test: (m: string) => m === "next" || m.startsWith("next/") },
  {
    label: "Cloudflare/OpenNext",
    test: (m: string) => m.startsWith("@opennextjs") || m.startsWith("cloudflare"),
  },
  {
    label: "Drizzle / データベース",
    test: (m: string) =>
      m.startsWith("drizzle-orm") || m.startsWith("drizzle-kit") || m.includes("better-sqlite3"),
  },
  {
    label: "スキーマ / DB 層",
    test: (m: string) => /(^|\/)db(\/|$)/.test(m) || m.includes("schema"),
  },
  {
    label: "React",
    test: (m: string) => m === "react" || m.startsWith("react-") || m.startsWith("react/"),
  },
  {
    label: "Node の I/O",
    test: (m: string) => m.startsWith("node:") || ["fs", "http", "https", "net"].includes(m),
  },
];

describe("スケジューラの依存の向き", () => {
  const modules = importedModules(SOURCE);

  it("何も import していない（純粋関数のため）", () => {
    expect(modules).toEqual([]);
  });

  for (const { label, test } of FORBIDDEN) {
    it(`${label} を import していない`, () => {
      expect(modules.filter(test)).toEqual([]);
    });
  }

  it("内部で時計を読んでいない（design.md D1）", () => {
    // 現在時刻は引数で受け取る。ここが破られると
    // 「3日後に出題される」を決定的に検証できなくなる。
    expect(SOURCE).not.toMatch(/Date\.now\s*\(/);
    expect(SOURCE).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(SOURCE).not.toMatch(/performance\.now\s*\(/);
  });
});
