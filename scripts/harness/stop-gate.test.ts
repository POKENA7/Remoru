import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stop hook の 3 分岐（design.md D4）。
 *
 *   再入（stop_hook_active: true） → 0
 *   差分なし                       → 0
 *   検査が落ちる                   → 2
 *
 * 検査するのは**門の分岐**であって、検査そのものの中身ではない（それは
 * checks.test.ts が見ている）。そのため使い捨てのリポジトリを HARNESS_ROOT に
 * 渡し、`check:types` / `check:test` を落ちる／通るだけの script に差し替える。
 *
 * 本物のリポジトリで試すと「差分なし」の入力が作れず、3 分岐のうち 1 つを
 * 永久に検査できないままになる。
 */

const GATE = join(process.cwd(), "scripts", "harness", "stop-gate.sh");

/** 使い捨ての git リポジトリを作る。checks は package.json に埋める終了コード */
function makeRepo(opts: { dirty: boolean; typesExit: number; testExit: number }): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-stop-"));
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8", stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "harness@example.invalid");
  git("config", "user.name", "harness");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "harness-stop-fixture",
        private: true,
        scripts: {
          "check:types": `exit ${opts.typesExit}`,
          "check:test": `exit ${opts.testExit}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  if (opts.dirty) writeFileSync(join(dir, "dirty.txt"), "編集した\n");
  return dir;
}

/** 門を 1 回走らせて終了コードを返す */
function runGate(dir: string, payload: object): number {
  const r = spawnSync("bash", [GATE], {
    cwd: dir,
    env: { ...process.env, HARNESS_ROOT: dir },
    input: JSON.stringify(payload),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return r.status ?? -1;
}

function withRepo(opts: { dirty: boolean; typesExit: number; testExit: number }, payload: object) {
  const dir = makeRepo(opts);
  try {
    return runGate(dir, payload);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Stop hook の分岐（D4）", () => {
  it("再入は何もせず 0（検査が落ちる状態でも止めない）", () => {
    expect(withRepo({ dirty: true, typesExit: 1, testExit: 0 }, { stop_hook_active: true })).toBe(
      0,
    );
  });

  it("差分が無ければ 0（読むだけのターンで検査を走らせない）", () => {
    expect(withRepo({ dirty: false, typesExit: 1, testExit: 1 }, { stop_hook_active: false })).toBe(
      0,
    );
  });

  it("check:types が落ちたら 2 で終了を拒む", () => {
    expect(withRepo({ dirty: true, typesExit: 1, testExit: 0 }, { stop_hook_active: false })).toBe(
      2,
    );
  });

  it("check:test が落ちたら 2 で終了を拒む", () => {
    expect(withRepo({ dirty: true, typesExit: 0, testExit: 1 }, { stop_hook_active: false })).toBe(
      2,
    );
  });

  it("差分があって検査が全部通れば 0", () => {
    expect(withRepo({ dirty: true, typesExit: 0, testExit: 0 }, { stop_hook_active: false })).toBe(
      0,
    );
  });

  it("落ちた検査は failures.jsonl に 1 行残る（D8 / タスク 7.2）", () => {
    const dir = makeRepo({ dirty: true, typesExit: 1, testExit: 0 });
    try {
      expect(runGate(dir, { stop_hook_active: false })).toBe(2);
      const rows = readFileSync(join(dir, ".learnings", "failures.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ check: "check:types", exit: 2, phase: "stop" });
      expect(existsSync(join(dir, ".learnings", "failures.jsonl"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("差分が無くても棚卸の候補があれば 2（コミット直後に素通りさせない）", () => {
    const dir = makeRepo({ dirty: false, typesExit: 0, testExit: 0 });
    try {
      mkdirSync(join(dir, ".learnings"), { recursive: true });
      writeFileSync(
        join(dir, ".learnings", "failures.jsonl"),
        `${Array.from({ length: 3 }, () =>
          JSON.stringify({
            ts: "",
            check: "check:test",
            exit: 2,
            head: "",
            change: "c",
            phase: "stop",
          }),
        ).join("\n")}\n`,
      );
      expect(runGate(dir, { stop_hook_active: false })).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("読めない入力は再入とみなさず検査を走らせる（fail closed）", () => {
    const dir = makeRepo({ dirty: true, typesExit: 1, testExit: 0 });
    try {
      const r = spawnSync("bash", [GATE], {
        cwd: dir,
        env: { ...process.env, HARNESS_ROOT: dir },
        input: "これは JSON ではない",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(r.status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
