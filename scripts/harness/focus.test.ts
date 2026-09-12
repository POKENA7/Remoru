import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 作業中の change の宣言（review-with-change-context design.md D1）。
 *
 * 宣言先を「存在する change 名」に限るのは、綴りを間違えたまま宣言されると
 * `record-failure` の数え上げが誰のものでもない鍵に積み上がり、しきい値が
 * いつまでも立たない（あるいは別の change で立つ）という取り違えになるため。
 *
 * `--resolve` は読む側（record-failure.sh / review.sh / promote-gate.mjs）が
 * 使う入口で、決められないときは**何も出さずに 0 で終わる**。落とすかどうかは
 * 読む側が決める（review だけが落とす。D3）。
 */

const SCRIPT = join(process.cwd(), "scripts", "harness", "focus.sh");

function run(root: string, ...args: string[]) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, HARNESS_ROOT: root },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function withRoot<T>(changes: string[], fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "harness-focus-"));
  try {
    mkdirSync(join(root, "openspec", "changes", "archive"), { recursive: true });
    for (const c of changes) {
      mkdirSync(join(root, "openspec", "changes", c), { recursive: true });
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function declare(root: string, name: string) {
  mkdirSync(join(root, ".harness"), { recursive: true });
  writeFileSync(join(root, ".harness", "focus"), `${name}\n`);
}

describe("作業中の change の宣言（D1）", () => {
  it("存在しない change 名は拒み、ファイルを書かない", () => {
    withRoot(["change-a", "change-b"], (root) => {
      const r = run(root, "change-c");
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("change-c");
      expect(existsSync(join(root, ".harness", "focus"))).toBe(false);
    });
  });

  it("archive は change 名として拒む", () => {
    withRoot(["change-a"], (root) => {
      expect(run(root, "archive").status).toBe(1);
      expect(existsSync(join(root, ".harness", "focus"))).toBe(false);
    });
  });

  it("書いた値を読める", () => {
    withRoot(["change-a", "change-b"], (root) => {
      expect(run(root, "change-b").status).toBe(0);
      expect(readFileSync(join(root, ".harness", "focus"), "utf8").trim()).toBe("change-b");
      expect(run(root).stdout.trim()).toBe("change-b");
      expect(run(root, "--resolve").stdout.trim()).toBe("change-b");
    });
  });

  it("宣言が無く change が 2 件以上なら --resolve は空を返す（0 で終わる）", () => {
    withRoot(["change-a", "change-b"], (root) => {
      const r = run(root, "--resolve");
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("");
    });
  });

  it("宣言が無く change が 1 件だけならそれを返す", () => {
    withRoot(["change-a"], (root) => {
      expect(run(root, "--resolve").stdout.trim()).toBe("change-a");
    });
  });

  it("宣言された change が消えていれば宣言を無視する", () => {
    withRoot(["change-a"], (root) => {
      declare(root, "archived-one");
      // 1 件だけ残っている方へ落ちる。古い宣言のまま数え続けない
      expect(run(root, "--resolve").stdout.trim()).toBe("change-a");
    });
  });

  it("宣言が無いときの表示は非ゼロで、打つべきコマンドを出す", () => {
    withRoot(["change-a", "change-b"], (root) => {
      const r = run(root);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("harness:focus");
    });
  });
});
