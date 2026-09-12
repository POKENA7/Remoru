import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 層の向きを固定する（component-directories / enforce-layer-boundaries）。
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
 *
 * enforce-layer-boundaries で 3 つ足して 5 つになった（design D1）。
 * 足したのは「見ていない向き」——`app/` からの直接の D1 アクセス、
 * `"use client"` からサーバー専用モジュールへの参照、cron worker から
 * 入口（`queries` / `actions`）への参照。**どれも型検査では出ない。**
 * 2 つ目は `next build` でしか、3 つ目は Workers の実行時でしか出ない。
 *
 * 規則の判定は `violations(rule, path, src)` に切り出してある（design D3）。
 * 実ツリーの走査と、違反を注入したときに赤くなることの確認（L06）が、
 * **同じ関数**を通る。検査とその検査の検査が別物になると、片方だけ直る。
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

/**
 * import 指定子を全部拾う。type import も side-effect import も含める。
 *
 * **再エクスポート（`export { x } from "…"` / `export * from "…"`）も拾う。**
 * これが抜けていると、`export { getDb } from "@/lib/db"` の 1 行を挟むだけで
 * 規則 2〜4 を迂回できる（レビューの指摘）。バンドラから見れば依存は同じである。
 */
function specifiers(src: string): string[] {
  const found: string[] = [];
  for (const re of [
    /^\s*import\s+[^;]*?from\s+["']([^"']+)["']/gm,
    /^\s*import\s+["']([^"']+)["']/gm,
    /^\s*export\s+[^;]*?from\s+["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const m of src.matchAll(re)) found.push(m[1]);
  }
  return found;
}

/**
 * `"use client"` を持つファイルか。
 *
 * **先頭 3 行以内の行頭にあるものだけ**を見る（design D1）。コメントや
 * 説明文の中で `"use client"` に言及しているファイルを巻き込まない。
 * ディレクティブは実際に先頭になければ効かないので、ここを緩める理由が無い。
 */
function isClientFile(src: string): boolean {
  return src
    .split("\n")
    .slice(0, 3)
    .some((line) => /^["']use client["']/.test(line));
}

type Rule = {
  /** design D1 の番号。メッセージにそのまま出る */
  id: number;
  /** 人が読む規則の名前。it() の名前にも使う */
  title: string;
  /** この規則の対象になるファイルか（ROOT からの相対パスと中身で決める） */
  applies: (rel: string, src: string) => boolean;
  /** 禁じている import 指定子か */
  forbids: (spec: string) => boolean;
  /** 違反したときの直し方。メッセージの 2 行目 */
  remedy: string;
};

/** `a/b/c` の末尾要素が `name` か。`@/lib/db` も `../../lib/db` も拾う */
const endsWithPath = (spec: string, path: string) =>
  new RegExp(`(^|/)${path.replace(/\//g, "\\/")}$`).test(spec);

const RULES: Rule[] = [
  {
    id: 1,
    title: "features/ lib/ hooks/ は app/ を参照しない",
    applies: (rel) => /^(features|lib|hooks)\//.test(rel),
    forbids: (s) => s.startsWith("@/app/") || /(^|\/)\.\.\/app\//.test(s),
    remedy: "共有したい型や部品は features/ か lib/ へ下ろすこと。",
  },
  {
    id: 2,
    title: "app/ は lib/db と drizzle-orm を参照しない",
    applies: (rel) => rel.startsWith("app/"),
    forbids: (s) =>
      endsWithPath(s, "lib/db") || s === "drizzle-orm" || s.startsWith("drizzle-orm/"),
    remedy: "読み取りは features/<機能>/queries.ts、書き込みは actions.ts を経由すること。",
  },
  {
    id: 3,
    // Server Action は Client Component から import して呼ぶのが正規の使い方
    // なので、`actions` は対象外にしてある（design D1）。
    title: '"use client" のファイルは queries / server-only / lib/db を参照しない',
    applies: (_rel, src) => isClientFile(src),
    forbids: (s) => endsWithPath(s, "queries") || s === "server-only" || endsWithPath(s, "lib/db"),
    remedy: "サーバーで読んで props で渡すこと。書き込みは actions.ts を import して呼んでよい。",
  },
  {
    id: 4,
    title: "cron-worker/src/ は queries / actions / lib/db / lib/session を参照しない",
    applies: (rel) => rel.startsWith("cron-worker/src/"),
    forbids: (s) =>
      endsWithPath(s, "queries") ||
      endsWithPath(s, "actions") ||
      endsWithPath(s, "lib/db") ||
      endsWithPath(s, "lib/session"),
    remedy:
      "cron worker は Next.js のアプリではない。features/<機能>/<機能>.ts の純関数だけを読むこと。",
  },
  {
    id: 5,
    title: "lib/ は features/ を参照しない",
    applies: (rel) => rel.startsWith("lib/"),
    forbids: (s) => s.startsWith("@/features/") || /(^|\/)\.\.\/features\//.test(s),
    remedy: "lib/ は外部ライブラリのラッパーだけ。機能を知ってはいけない。",
  },
];

/**
 * 1 ファイルに 1 規則を当てて、違反の行を返す（design D2 / D3）。
 *
 * 戻り値の各行はそのまま `expect(offenders).toEqual([])` に載る。
 * 番号と直し方を入れておかないと、赤くなった人が次に何をすればいいか
 * 分からない（`docs/Harness Engineering Checklist.md`「Architecture 違反の
 * エラーメッセージに修正方法または参照先が含まれる」）。
 */
function violations(rule: Rule, rel: string, src: string): string[] {
  if (!rule.applies(rel, src)) return [];
  return specifiers(src)
    .filter(rule.forbids)
    .map((s) => `layers #${rule.id}: ${rel} が ${s} を import している。\n  ${rule.remedy}`);
}

/** 実ツリーの走査対象。規則ごとに絞らず、全部に全規則を当てる */
const SCANNED = ["app", "features", "lib", "hooks", "cron-worker/src"].flatMap((dir) =>
  sources(dir).map((f) => ({ rel: f.slice(ROOT.length + 1), src: readFileSync(f, "utf8") })),
);

describe("層の向き（layers #1〜#5）", () => {
  it("走査対象が空でない", () => {
    // 置き場を間違えて 0 件になると、下の検査は全部緑になってしまう
    expect(SCANNED.filter((f) => f.rel.startsWith("features/")).length).toBeGreaterThan(20);
    expect(SCANNED.filter((f) => f.rel.startsWith("lib/")).length).toBeGreaterThan(2);
    expect(SCANNED.filter((f) => f.rel.startsWith("app/")).length).toBeGreaterThan(5);
    expect(SCANNED.filter((f) => f.rel.startsWith("cron-worker/src/")).length).toBeGreaterThan(1);
    // 規則 3 は中身で対象が決まるので、対象が 0 件になっていないことも見る
    expect(SCANNED.filter((f) => isClientFile(f.src)).length).toBeGreaterThan(5);
  });

  for (const rule of RULES) {
    it(`#${rule.id} ${rule.title}`, () => {
      const offenders = SCANNED.flatMap((f) => violations(rule, f.rel, f.src));
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * 違反を注入して赤くなることを確かめる（L06）。
 *
 * ファイルは作らない。`violations()` は文字列を受けるので、違反する 1 行を
 * 含む仮のソースを渡せば足りる（design D3）。5 つとも「違反 → 非空」と
 * 「取り除く → 空」の両方を見る。前者だけだと常に赤い規則も通り、
 * 後者だけだと常に緑の規則も通る。
 */
describe("注入すると赤くなる（L06）", () => {
  const CASES: { rule: number; rel: string; bad: string; ok: string }[] = [
    {
      rule: 1,
      rel: "features/memo/components/memo-screen.tsx",
      bad: 'import type { Props } from "@/app/app-shell";\n',
      ok: 'import type { Props } from "../types";\n',
    },
    {
      rule: 2,
      rel: "app/(app)/page.tsx",
      bad: 'import { getDb } from "@/lib/db";\n',
      ok: 'import { listMemos } from "@/features/memo/queries";\n',
    },
    {
      rule: 3,
      rel: "features/memo/components/memo-screen.tsx",
      bad: '"use client";\nimport { listMemos } from "../queries";\n',
      ok: '"use client";\nimport type { Memo } from "../types";\n',
    },
    {
      rule: 4,
      rel: "cron-worker/src/index.ts",
      bad: 'import { getDb } from "../../lib/db";\n',
      ok: 'import { startOfReviewDay } from "../../features/review/review-scheduler";\n',
    },
    {
      rule: 5,
      rel: "lib/db.ts",
      bad: 'import { listMemos } from "@/features/memo/memos";\n',
      ok: 'import { drizzle } from "drizzle-orm/d1";\n',
    },
  ];

  for (const c of CASES) {
    const rule = RULES.find((r) => r.id === c.rule)!;

    it(`#${c.rule} は違反を見つける`, () => {
      const found = violations(rule, c.rel, c.bad);
      expect(found.length).toBeGreaterThan(0);
      // メッセージに番号と直し方が入っていること（design D2）
      expect(found[0]).toContain(`layers #${c.rule}`);
      expect(found[0]).toContain(c.rel);
      expect(found[0]).toContain(rule.remedy);
    });

    it(`#${c.rule} は正しい import を弾かない`, () => {
      expect(violations(rule, c.rel, c.ok)).toEqual([]);
    });
  }

  /**
   * 規則 3 の境目。Server Action を Client Component から import して呼ぶのは
   * **正規の使い方**なので、弾いてはいけない（tasks 1.4）。これを弾く検査を
   * 入れると、`move-client-boundary-to-leaves` で葉に境界を下ろした瞬間に
   * 全部の葉が赤くなる。
   */
  it("#3 は Client Component からの actions の import を違反にしない", () => {
    const rule = RULES.find((r) => r.id === 3)!;
    const src = [
      '"use client";',
      'import { saveMemo } from "../actions";',
      'import { deleteMemo } from "@/features/memo/actions";',
      "",
    ].join("\n");
    expect(violations(rule, "features/memo/components/memo-screen.tsx", src)).toEqual([]);
  });

  /**
   * 再エクスポートでの迂回（レビューの指摘）。`export … from` は `import` の
   * 語を含まないので、指定子を `import` だけで拾っていると素通りする。
   */
  it("再エクスポートでも迂回できない", () => {
    const r2 = RULES.find((r) => r.id === 2)!;
    expect(
      violations(r2, "app/(app)/page.tsx", 'export { getDb } from "@/lib/db";\n'),
    ).toHaveLength(1);
    expect(violations(r2, "app/(app)/page.tsx", 'export * from "drizzle-orm";\n')).toHaveLength(1);

    const r3 = RULES.find((r) => r.id === 3)!;
    expect(
      violations(
        r3,
        "features/memo/components/x.tsx",
        '"use client";\nexport * from "../queries";\n',
      ),
    ).toHaveLength(1);
  });

  /**
   * `"use client"` の判定が、先頭 3 行以内の行頭だけを見ていること。
   * コメントで言及しているだけのファイルを規則 3 に巻き込まない。
   */
  it('#3 はコメント中の "use client" を対象にしない', () => {
    const rule = RULES.find((r) => r.id === 3)!;
    const src = [
      '// この部品は将来 "use client" を付ける予定',
      'import { listMemos } from "./queries";',
      "",
    ].join("\n");
    expect(violations(rule, "features/memo/memo-container.tsx", src)).toEqual([]);
  });
});
