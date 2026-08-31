#!/usr/bin/env node
//
// 学びの引用数を git から数え直す（design.md D11）。
//
// 手で数えた値は 15 change 分ずれていた。同じ設計の同じファイルで、機械が数える側
// （commit trailer）だけが 15 change 生き続け、人が更新する側（index.json）は最初の
// change で止まった。裁量に依存する経路は静かに止まる、の実測である。
//
// id と type と capturedIn は既存の index.json から引き継ぐ。cites だけを書き直す。
// active.md に新しい学びが増えていたら、cites だけ数えて type は "unknown" にする。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.HARNESS_ROOT ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const ACTIVE = join(ROOT, ".learnings", "active.md");
const INDEX = join(ROOT, ".learnings", "index.json");

/** commit trailer `Learning: LNN` を全ブランチから数える */
function citeCounts() {
  const body = execFileSync("git", ["log", "--all", "--grep", "Learning: L", "--format=%b"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const counts = new Map();
  // 1 行に複数並べた形（`Learning: L04, L06`）も両方数える。proposal の
  // `grep -o "Learning: L[0-9]*"` はこの形を L04 としか数えておらず、L06 を
  // 2 件取りこぼしていた。数え方そのものが手作業の側にあったということである
  for (const m of body.matchAll(/^Learning:\s*(L\d+(?:\s*,\s*L\d+)*)\s*$/gm)) {
    for (const id of m[1].split(",").map((x) => x.trim())) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** active.md に載っている学びの id を出現順に返す */
function activeIds() {
  if (!existsSync(ACTIVE)) return [];
  return [...readFileSync(ACTIVE, "utf8").matchAll(/^-\s+\*\*\[(L\d+)\]/gm)].map((m) => m[1]);
}

const previous = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : [];
const meta = new Map(previous.map((row) => [row.id, row]));
const counts = citeCounts();

const ids = activeIds();
if (ids.length === 0) {
  console.error("learnings:index: active.md から学びを読めなかった。書き換えない。");
  process.exit(1);
}

const rows = ids.map((id) => ({
  id,
  type: meta.get(id)?.type ?? "unknown",
  capturedIn: meta.get(id)?.capturedIn ?? null,
  cites: counts.get(id) ?? 0,
}));

writeFileSync(INDEX, `${JSON.stringify(rows, null, 2)}\n`);
console.log(
  rows
    .filter((r) => r.cites > 0)
    .map((r) => `${r.id}=${r.cites}`)
    .join(" ") || "引用はまだ無い",
);
