import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 失敗の記録（design.md D8）。書くのは hook が呼ぶこの script だけで、LLM は書かない。
 *
 * `check:secrets` の失敗で `head` を残さないことをここで固定する。
 * scan-secrets.sh 側でも値は出さないようにしてあるが、public リポジトリなので
 * 二重に防ぐ。片方を後で緩めたときに、もう片方が気づく形にしておく。
 */

const SCRIPT = join(process.cwd(), "scripts", "harness", "record-failure.sh");

function record(check: string, stderr: string, changes: string[] = ["add-something"]) {
  const root = mkdtempSync(join(tmpdir(), "harness-record-"));
  try {
    for (const c of changes) {
      mkdirSync(join(root, "openspec", "changes", c), { recursive: true });
    }
    mkdirSync(join(root, "openspec", "changes", "archive"), { recursive: true });
    spawnSync("bash", [SCRIPT, check, "2", "stop"], {
      cwd: root,
      env: { ...process.env, HARNESS_ROOT: root },
      input: stderr,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readFileSync(join(root, ".learnings", "failures.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    return lines.map((l) => JSON.parse(l));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("失敗の記録（D8）", () => {
  it("1 行 1 件で追記され、stderr の先頭の空でない 1 行だけが入る", () => {
    // 先頭が空行なのは vitest の実際の出力。素直に head -1 すると何も残らず、
    // 「記録はされているが中身が空」という一番たちの悪い形になる
    const rows = record("check:types", "\n\napp/foo.ts(12,3): error TS2345\n2 行目は入らない\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].check).toBe("check:types");
    expect(rows[0].exit).toBe(2);
    expect(rows[0].phase).toBe("stop");
    expect(rows[0].head).toBe("app/foo.ts(12,3): error TS2345");
    expect(rows[0].head).not.toContain("2 行目");
  });

  it("check:secrets の失敗では head を残さない", () => {
    const rows = record("check:secrets", "NG: .env.production に実鍵がある\n");
    expect(rows[0].check).toBe("check:secrets");
    expect(rows[0].head).toBe("");
  });

  it("作業中の change 名が入る（archive は除く）", () => {
    const rows = record("check:test", "失敗\n", ["add-deterministic-harness"]);
    expect(rows[0].change).toBe("add-deterministic-harness");
  });

  it("未アーカイブの change が複数あるときは change を null にする", () => {
    // 先頭を選ぶと、落ちていない change に失敗が積み上がって
    // D9 のしきい値が別の change で立つ／立たないという取り違えになる
    const rows = record("check:test", "失敗\n", ["change-a", "change-b"]);
    expect(rows[0].change).toBeNull();
  });

  it("change が 1 件も無ければ null", () => {
    const rows = record("check:test", "失敗\n", []);
    expect(rows[0].change).toBeNull();
  });
});
