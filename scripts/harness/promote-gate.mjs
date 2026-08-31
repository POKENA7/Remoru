#!/usr/bin/env node
//
// 同じ検査が繰り返し落ちたら棚卸を強制する（design.md D9）。
//
//   --list    未処理の候補を JSON で出す（テスト用）
//   --gate    未処理かつ未ブロックの候補があれば exit 2。Stop hook が使う
//   --record  決定を .harness/promotions.json に書く（npm run harness:promote）
//
// **1 候補につきブロックは 1 回**である。逃げ道の無い門は disableAllHooks で
// 丸ごと殺されるので、2 回目からは通す。ただし「未処理のまま通した」ことは
// blocked.json に残る。決定は harness:promote だけが書ける。LLM の自己申告では
// なくファイルの状態で判定するためである。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.env.HARNESS_ROOT ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const FAILURES = join(ROOT, ".learnings", "failures.jsonl");
const PROMOTIONS = join(ROOT, ".harness", "promotions.json");
const BLOCKED = join(ROOT, ".harness", "blocked.json");

/** 同一 check が同一 change 内で何回落ちたら候補にするか。理論的根拠はない（D9） */
const THRESHOLD = 3;

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        // 壊れた 1 行で棚卸全体を止めない。追記ログなので途中で切れることがある
        return [];
      }
    });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const key = (check, change) => `${check}@${change ?? "null"}`;

/** 未処理の候補（しきい値に達し、まだ決定が書かれていないもの）を返す */
function candidates() {
  const counts = new Map();
  for (const f of readJsonl(FAILURES)) {
    if (!f?.check) continue;
    const k = key(f.check, f.change);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const decided = new Set(readJson(PROMOTIONS, []).map((d) => key(d.check, d.change)));
  return [...counts.entries()]
    .filter(([k, n]) => n >= THRESHOLD && !decided.has(k))
    .map(([k, n]) => ({ key: k, check: k.split("@")[0], count: n }));
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

if (args.includes("--record")) {
  const check = flag("check");
  const decision = flag("decision");
  const note = flag("note") ?? "";
  if (!check || !["rule", "check", "skip"].includes(decision ?? "")) {
    console.error('harness:promote -- --check <id> --decision rule|check|skip --note "理由"');
    process.exit(1);
  }
  // check id だけで探すと、別の change に残った古い候補に決定が紐づく。
  // 候補が 1 件に絞れないときは --change を要求する
  const matching = candidates().filter((c) => c.check === check);
  const asked = flag("change");
  let change;
  if (asked !== undefined) {
    change = asked === "null" ? null : asked;
  } else if (matching.length <= 1) {
    const k = matching[0]?.key.split("@")[1];
    change = k === undefined || k === "null" ? null : k;
  } else {
    console.error(
      `${check} の候補が ${matching.length} 件ある。どの change かを --change で指定すること:`,
    );
    for (const c of matching) console.error(`  --change ${c.key.split("@")[1]}`);
    process.exit(1);
  }
  const rows = readJson(PROMOTIONS, []);
  rows.push({
    check,
    change,
    decision,
    note,
    ts: new Date().toISOString(),
  });
  writeJson(PROMOTIONS, rows);
  console.log(`棚卸: ${check} を ${decision} として記録した。`);
  // 引用数を数え直す（D11 / タスク 8.3）。Stop hook からは呼ばない。毎ターン
  // index.json に差分が出ると、それ自体がうるさくて外される側に回る
  try {
    execFileSync("node", [join(dirname(process.argv[1]), "learnings-index.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch {
    // 学びの集計に失敗しても棚卸の記録は残す。ここで落とす理由が無い
  }
  process.exit(0);
}

const open = candidates();

if (args.includes("--list")) {
  console.log(JSON.stringify(open));
  process.exit(0);
}

if (args.includes("--gate")) {
  const blocked = new Set(readJson(BLOCKED, []));
  const fresh = open.filter((c) => !blocked.has(c.key));
  if (fresh.length === 0) process.exit(0);

  for (const c of fresh) blocked.add(c.key);
  writeJson(BLOCKED, [...blocked]);

  console.error("同じ検査が繰り返し落ちている。棚卸をしてから終えること（D9）。");
  for (const c of fresh) {
    console.error(`  ${c.check}: ${c.count} 回`);
  }
  console.error(
    "  規則にする / 検査を足す / 見送る のどれかを選び、次を実行すること:\n" +
      '  npm run harness:promote -- --check <id> --decision rule|check|skip --note "理由"',
  );
  process.exit(2);
}

console.error("使い方: promote-gate.mjs --list | --gate | --record ...");
process.exit(1);
