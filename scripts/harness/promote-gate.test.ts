import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 棚卸の強制（design.md D9）。
 *
 * 同一 check が同一 change 内で 3 回以上落ち、決定がまだ無ければ Stop hook を
 * 止める。ただし**1 候補につきブロックは 1 回**。逃げ道の無い門は
 * disableAllHooks で丸ごと殺されるので、2 回目からは通す。
 *
 * ロックが外れる条件をコマンドの実行にしたのは、対応したかどうかを LLM の
 * 自己申告ではなく**ファイルの状態**で判定するためである。
 */

const SCRIPT = join(process.cwd(), "scripts", "harness", "promote-gate.mjs");

function makeRoot(failures: Array<{ check: string; change: string | null }>): string {
  const root = mkdtempSync(join(tmpdir(), "harness-promote-"));
  mkdirSync(join(root, ".learnings"), { recursive: true });
  writeFileSync(
    join(root, ".learnings", "failures.jsonl"),
    `${failures
      .map((f) => JSON.stringify({ ts: "", exit: 2, head: "", ...f, phase: "stop" }))
      .join("\n")}\n`,
  );
  return root;
}

function run(root: string, ...args: string[]) {
  const r = spawnSync("node", [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, HARNESS_ROOT: root },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function times(n: number, check: string, change: string | null = "add-deterministic-harness") {
  return Array.from({ length: n }, () => ({ check, change }));
}

function withRoot<T>(
  failures: Array<{ check: string; change: string | null }>,
  fn: (root: string) => T,
): T {
  const root = makeRoot(failures);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("棚卸の強制（D9）", () => {
  it("同一 check の失敗が 2 回では候補にならない", () => {
    withRoot(times(2, "check:types"), (root) => {
      expect(JSON.parse(run(root, "--list").stdout)).toEqual([]);
      expect(run(root, "--gate").status).toBe(0);
    });
  });

  it("3 回でブロックが立つ", () => {
    withRoot(times(3, "check:types"), (root) => {
      expect(JSON.parse(run(root, "--list").stdout)).toHaveLength(1);
      const r = run(root, "--gate");
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("check:types");
      expect(r.stderr).toContain("harness:promote");
    });
  });

  it("同じ候補で 2 回連続はブロックしない（1 候補 1 ブロック）", () => {
    withRoot(times(3, "check:types"), (root) => {
      expect(run(root, "--gate").status).toBe(2);
      expect(run(root, "--gate").status).toBe(0);
    });
  });

  it("change が違えば別の候補として数える", () => {
    withRoot(
      [...times(3, "check:types", "change-a"), ...times(2, "check:types", "change-b")],
      (root) => {
        const open = JSON.parse(run(root, "--list").stdout);
        expect(open).toHaveLength(1);
        expect(open[0].key).toBe("check:types@change-a");
      },
    );
  });

  it("skip の決定を書くとロックが外れ、記録が残る", () => {
    withRoot(times(3, "check:types"), (root) => {
      expect(run(root, "--gate").status).toBe(2);
      const rec = run(
        root,
        "--record",
        "--check",
        "check:types",
        "--decision",
        "skip",
        "--note",
        "今は見送る",
      );
      expect(rec.status).toBe(0);
      expect(JSON.parse(run(root, "--list").stdout)).toEqual([]);
      const rows = JSON.parse(readFileSync(join(root, ".harness", "promotions.json"), "utf8"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        check: "check:types",
        change: "add-deterministic-harness",
        decision: "skip",
        note: "今は見送る",
      });
    });
  });

  it("同じ check の候補が複数の change にあるときは --change を要求する", () => {
    withRoot(
      [...times(3, "check:types", "change-a"), ...times(3, "check:types", "change-b")],
      (root) => {
        const rec = run(root, "--record", "--check", "check:types", "--decision", "skip");
        expect(rec.status).toBe(1);
        expect(rec.stderr).toContain("--change");
        expect(JSON.parse(run(root, "--list").stdout)).toHaveLength(2);
      },
    );
  });

  it("--change を渡せばその change に紐づけて記録する", () => {
    withRoot(
      [...times(3, "check:types", "change-a"), ...times(3, "check:types", "change-b")],
      (root) => {
        const rec = run(
          root,
          "--record",
          "--check",
          "check:types",
          "--decision",
          "skip",
          "--change",
          "change-b",
        );
        expect(rec.status).toBe(0);
        const open = JSON.parse(run(root, "--list").stdout);
        expect(open).toHaveLength(1);
        expect(open[0].key).toBe("check:types@change-a");
      },
    );
  });

  it("決定の値が rule / check / skip 以外なら書かない", () => {
    withRoot(times(3, "check:types"), (root) => {
      const rec = run(root, "--record", "--check", "check:types", "--decision", "てきとう");
      expect(rec.status).toBe(1);
      expect(JSON.parse(run(root, "--list").stdout)).toHaveLength(1);
    });
  });

  it("壊れた行があっても他の行は数える", () => {
    withRoot(times(3, "check:types"), (root) => {
      const p = join(root, ".learnings", "failures.jsonl");
      writeFileSync(p, `${readFileSync(p, "utf8")}{壊れている\n`);
      expect(JSON.parse(run(root, "--list").stdout)).toHaveLength(1);
    });
  });
});
