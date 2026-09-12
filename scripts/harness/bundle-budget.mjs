#!/usr/bin/env node
/**
 * 経路 1 つを開くために読み込むクライアント JS の gzip 合計を、予算と比べる。
 * measure-first-paint design D3 / performance spec「転送量の予算」。
 *
 * **なぜビルドの生成物を読むのか。** `next build` は転送量を出力しない（Next 16 の
 * ビルド結果に First Load JS の列は無い）。先行する 2 つの change は
 * `.next/static/chunks/*.js` の**合計**で比べていたが、それは 4 経路ぶんを足した値で、
 * 利用者 1 人が読む量ではない。ここが埋める欠落である。
 *
 * **読む場所（検証済み）。** 経路が読むチャンクは 2 か所に分かれて記録されている。
 *   - `build-manifest.json` の `rootMainFiles` — 全経路共通の枠
 *   - `server/app/<...>/page_client-reference-manifest.js` の `clientModules[].chunks`
 *     — その経路固有の Client Component
 * この 2 つの和集合が、ブラウザが `<script>` で読む一覧と一致する。
 *
 * 2026-09-12 に `/sign-in` で突き合わせて確かめた。本番
 * （remoru.pokena191.workers.dev）の HTML が挙げる 11 本を実際に取得した合計が
 * 223,559 B、同じ式でローカルのビルドから計算した値が 223,565 B。**差 6 バイト。**
 * 読む場所が違えば、この一致は起きない。
 *
 * **`polyfillFiles` は入れない。** 本番の `<script>` に `noModule` が付いており、
 * 現代のブラウザはダウンロードしない。spec は「`/` を開くために読み込む」量を
 * 縛っているので、読まれない 38.6 KB を予算に入れると、予算が実態から離れる。
 * （`docs/nextjs-rework-plan.md` に「自前 JS 224 KB」とあるのは `/sign-in` の値で、
 * この polyfill を含んでいる。`/` の値ではない。）
 *
 * **この検査は自前のチャンクしか見ない。** Clerk の `clerk.browser.js`（81 KB）と
 * `@clerk/ui`（44 KB）は別オリジンの CDN から来るので、ビルドの生成物に現れない。
 * それらは `docs/perf.md` の計測で見る。
 *
 * gzip は level 9。本番との 6 バイト差はこの水準で得た値である。
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

/** 予算ファイルは差し替えられるようにする（bundle-budget.test.ts が小さい予算を渡す） */
const budgetPath = process.env.BUNDLE_BUDGET_FILE
  ? resolve(process.env.BUNDLE_BUDGET_FILE)
  : join(HERE, "bundle-budget.json");
const nextDir = resolve(process.env.BUNDLE_BUDGET_NEXT_DIR ?? join(ROOT, ".next"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * `page_client-reference-manifest.js` から `clientModules` を取り出す。
 *
 * このファイルは JSON ではなく `globalThis.__RSC_MANIFEST["<key>"] = {…};` という
 * 代入文である。`JSON.parse` も `import` もできないので、最初の `= {` から
 * 最後の `}` までを切り出して読む。`eval` を使わないのは、ビルドの生成物を
 * 検査が実行することになるため。
 */
function parseClientManifest(path) {
  const src = readFileSync(path, "utf8");
  const assign = src.indexOf("= {", src.indexOf('__RSC_MANIFEST["'));
  if (assign < 0) throw new Error(`clientModules を取り出せない: ${path}`);
  return JSON.parse(src.slice(assign + 2, src.lastIndexOf("}") + 1));
}

/** 経路（"/"）から、その経路の manifest がある app のパス（"/(app)/page"）を引く */
function appPathFor(route) {
  const routes = readJson(join(nextDir, "app-path-routes-manifest.json"));
  const hit = Object.entries(routes).find(([, r]) => r === route);
  if (!hit) throw new Error(`経路 ${route} がビルド結果に無い`);
  return hit[0];
}

/** 経路が読むチャンクの一覧（`.next/` からの相対パス）。上のコメントの 2 か所の和集合 */
function chunksFor(route) {
  const build = readJson(join(nextDir, "build-manifest.json"));
  const manifest = parseClientManifest(
    join(nextDir, "server", "app", `${appPathFor(route)}_client-reference-manifest.js`),
  );
  const chunks = new Set(build.rootMainFiles);
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) chunks.add(chunk.replace(/^\/_next\//, ""));
  }
  return [...chunks].sort();
}

function gzippedSize(relative) {
  return gzipSync(readFileSync(join(nextDir, relative)), { level: 9 }).length;
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

let failed = false;
const { routes: budgets } = readJson(budgetPath);

for (const [route, budget] of Object.entries(budgets)) {
  const chunks = chunksFor(route).map((file) => ({ file, size: gzippedSize(file) }));
  const total = chunks.reduce((sum, c) => sum + c.size, 0);
  const diff = total - budget;
  const sign = diff >= 0 ? "+" : "-";
  console.log(
    `${route}  実測 ${kb(total)}  予算 ${kb(budget)}  差 ${sign}${kb(Math.abs(diff))}  (${chunks.length} チャンク)`,
  );
  if (diff > 0) {
    failed = true;
    // 超えたときだけ内訳を出す。どのチャンクが太ったかが分からないと直せない
    console.error(`\n${route} が予算を ${kb(diff)} 超えている。内訳:`);
    for (const { file, size } of [...chunks].sort((a, b) => b.size - a.size)) {
      console.error(`  ${kb(size).padStart(9)}  ${file}`);
    }
    console.error(
      `\n減らせないなら ${budgetPath} を上げるが、理由を change の design に残すこと。`,
    );
  }
}

process.exit(failed ? 1 : 0);
