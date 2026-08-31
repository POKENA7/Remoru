import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * コミット前の門の 4 分岐（design.md D5 / D6）。
 *
 *   受領書なし                   → 2
 *   受領書あり findings 空       → 0
 *   受領書を作った後に差分を変える → 2（古い受領書で素通りしない）
 *   git commit を含まない Bash    → 0
 *
 * 使い捨てのリポジトリに対して走らせる。検査は落ちない script に差し替えて
 * あるので、ここで見ているのは**受領書の判定**だけである。検査そのものが
 * 違反を捕まえることは checks.test.ts が見ている。
 */

const GATE = join(process.cwd(), "scripts", "harness", "precommit-gate.sh");

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-precommit-"));
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8", stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "harness@example.invalid");
  git("config", "user.name", "harness");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "harness-precommit-fixture",
        private: true,
        scripts: { "check:types": "exit 0", "check:test": "exit 0" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, "code.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  return dir;
}

/** 作業ツリーに差分を作り、門が見るのと同じ規則でハッシュを計算する */
function stage(dir: string, content: string): string {
  writeFileSync(join(dir, "code.ts"), content);
  spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
  const diff = spawnSync("git", ["diff", "--cached"], { cwd: dir, encoding: "utf8" }).stdout;
  return createHash("sha256").update(diff).digest("hex");
}

function writeReceipt(dir: string, hash: string, findings: string[]) {
  const reviews = join(dir, ".harness", "reviews");
  mkdirSync(reviews, { recursive: true });
  writeFileSync(
    join(reviews, `${hash}.json`),
    JSON.stringify({ hash, ts: new Date().toISOString(), findings, body: "" }, null, 2),
  );
}

function runGate(dir: string, command: string): number {
  const r = spawnSync("bash", [GATE], {
    cwd: dir,
    env: { ...process.env, HARNESS_ROOT: dir },
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return r.status ?? -1;
}

function withRepo<T>(fn: (dir: string) => T): T {
  const dir = makeRepo();
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("コミット前の門（D5 / D6）", () => {
  it("(a) 受領書が無ければ 2", () => {
    withRepo((dir) => {
      stage(dir, "export const a = 2;\n");
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("(b) 受領書があり findings が空なら 0", () => {
    withRepo((dir) => {
      const hash = stage(dir, "export const a = 2;\n");
      writeReceipt(dir, hash, []);
      expect(runGate(dir, 'git commit -m "変更"')).toBe(0);
    });
  });

  it("(c) 受領書を作った後に差分を変えたら 2", () => {
    withRepo((dir) => {
      const hash = stage(dir, "export const a = 2;\n");
      writeReceipt(dir, hash, []);
      stage(dir, "export const a = 3;\n");
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("(d) git commit を含まない Bash は 0", () => {
    withRepo((dir) => {
      stage(dir, "export const a = 2;\n");
      expect(runGate(dir, "ls -la")).toBe(0);
      expect(runGate(dir, "git status")).toBe(0);
    });
  });

  it("findings が残っている受領書では通さない", () => {
    withRepo((dir) => {
      const hash = stage(dir, "export const a = 2;\n");
      writeReceipt(dir, hash, ["await が抜けている"]);
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("落ちる検査があれば受領書があっても 2（検査が先）", () => {
    withRepo((dir) => {
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify(
          {
            name: "harness-precommit-fixture",
            private: true,
            scripts: { "check:types": "exit 1", "check:test": "exit 0" },
          },
          null,
          2,
        )}\n`,
      );
      const hash = stage(dir, "export const a = 2;\n");
      writeReceipt(dir, hash, []);
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("index と作業ツリーがずれていたら 2（検査が見ていない内容をコミットさせない）", () => {
    withRepo((dir) => {
      const hash = stage(dir, "export const a = 2;\n");
      writeReceipt(dir, hash, []);
      // 受領書を作ったあとに、add せずに作業ツリーだけ書き換える
      writeFileSync(join(dir, "code.ts"), "export const a = 999;\n");
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("何もステージしていなければ未ステージの変更があっても 0（git commit -a の経路）", () => {
    withRepo((dir) => {
      // add せずに作業ツリーだけ書き換える。コミットされる木＝作業ツリーなので、
      // 検査が見た木と一致する。受領書は git diff HEAD のハッシュで作る
      writeFileSync(join(dir, "code.ts"), "export const a = 2;\n");
      const diff = spawnSync("git", ["diff", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout;
      writeReceipt(dir, createHash("sha256").update(diff).digest("hex"), []);
      expect(runGate(dir, 'git commit -am "変更"')).toBe(0);
    });
  });

  it("findings が配列でない壊れた受領書では通さない（fail open にしない）", () => {
    withRepo((dir) => {
      const hash = stage(dir, "export const a = 2;\n");
      const reviews = join(dir, ".harness", "reviews");
      mkdirSync(reviews, { recursive: true });
      writeFileSync(join(reviews, `${hash}.json`), JSON.stringify({ hash, ts: "", body: "" }));
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
    });
  });

  it("落ちた検査は failures.jsonl に 1 行残る（D8 / タスク 7.2）", () => {
    withRepo((dir) => {
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify(
          {
            name: "harness-precommit-fixture",
            private: true,
            scripts: { "check:types": "exit 1", "check:test": "exit 0" },
          },
          null,
          2,
        )}\n`,
      );
      stage(dir, "export const a = 2;\n");
      expect(runGate(dir, 'git commit -m "変更"')).toBe(2);
      const rows = readFileSync(join(dir, ".learnings", "failures.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ check: "check:types", exit: 2, phase: "precommit" });
    });
  });

  it("読めない入力は落とす側に倒す（D5）", () => {
    withRepo((dir) => {
      const r = spawnSync("bash", [GATE], {
        cwd: dir,
        env: { ...process.env, HARNESS_ROOT: dir },
        input: "これは JSON ではない",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(r.status).toBe(2);
    });
  });
});
