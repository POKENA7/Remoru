import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
const REVIEW = join(process.cwd(), "scripts", "harness", "review.sh");
const DIFF_HASH = join(process.cwd(), "scripts", "harness", "diff-hash.sh");

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

/**
 * レビューの前段（review-with-change-context design.md D1〜D4）。
 *
 * `claude -p` は PATH に置いた偽物に差し替える。ここで見たいのは
 * **差し込む文脈と、所見をどこに残すか**であって、モデルの返答ではない。
 * D3 の分岐だけはモデルを呼ぶ前に落ちるので、偽物すら要らない。
 */

function makeReviewRepo(changes: string[], trackedReviews: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-review-"));
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8", stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "harness@example.invalid");
  git("config", "user.name", "harness");
  mkdirSync(join(dir, "openspec", "changes", "archive"), { recursive: true });
  for (const c of changes) {
    mkdirSync(join(dir, "openspec", "changes", c, "specs", "memo-capture"), { recursive: true });
    writeFileSync(
      join(dir, "openspec", "changes", c, "tasks.md"),
      `## 1. ${c}\n\n- [x] 1.1 ${c} のタスク本文\n`,
    );
    writeFileSync(
      join(dir, "openspec", "changes", c, "specs", "memo-capture", "spec.md"),
      `## ADDED Requirements\n\n### Requirement: ${c} の spec 本文\n`,
    );
  }
  // すでに追跡されている reviews.md。**未追跡のままでは D6 を検査できない**——
  // 未追跡ファイルは `git diff --quiet` にも門の部分ステージ検査にも映らないので、
  // git add を外しても緑のままになる（注入で実際にそうなった）
  for (const c of trackedReviews) {
    writeFileSync(join(dir, "openspec", "changes", c, "reviews.md"), "## 前回のレビュー\n");
  }
  writeFileSync(join(dir, "code.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "fixture");
  writeFileSync(join(dir, "code.ts"), "export const a = 2;\n");
  git("add", "-A");
  return dir;
}

/** `claude` を名乗る偽物を PATH の先頭に置き、その bin ディレクトリを返す */
function fakeClaude(dir: string, response: object): string {
  const bin = join(dir, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, "claude");
  writeFileSync(
    stub,
    `#!/bin/bash\ncat > /dev/null\ncat <<'JSON'\n${JSON.stringify({
      is_error: false,
      result: JSON.stringify(response),
    })}\nJSON\n`,
  );
  chmodSync(stub, 0o755);
  return bin;
}

function runReview(dir: string, opts: { args?: string[]; bin?: string } = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, HARNESS_ROOT: dir };
  if (opts.bin) env.PATH = `${opts.bin}:${process.env.PATH}`;
  const r = spawnSync("bash", [REVIEW, ...(opts.args ?? [])], {
    cwd: dir,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/** 門とレビューが使うのと同じ規則でハッシュを出す（reviews.md は数えない。D6） */
function diffHash(dir: string): string {
  return spawnSync("bash", [DIFF_HASH], {
    cwd: dir,
    env: { ...process.env, HARNESS_ROOT: dir },
    encoding: "utf8",
  }).stdout.trim();
}

function withReviewRepo<T>(
  changes: string[],
  fn: (dir: string) => T,
  trackedReviews: string[] = [],
): T {
  const dir = makeReviewRepo(changes, trackedReviews);
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("レビューに change の文脈を渡す（D1〜D4）", () => {
  it("change が 2 件あり宣言が無ければ落ちる。受領書も所見も作らない（D3）", () => {
    withReviewRepo(["change-a", "change-b"], (dir) => {
      // モデルを PATH に置いていない。呼ぶ前に落ちる経路であることもここで見ている
      const r = runReview(dir);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("harness:focus");
      expect(existsSync(join(dir, ".harness", "reviews"))).toBe(false);
      expect(existsSync(join(dir, "openspec", "changes", "change-a", "reviews.md"))).toBe(false);
    });
  });

  it("宣言があれば、その change の tasks と spec がプロンプトに入る（D1 / D2）", () => {
    withReviewRepo(["change-a", "change-b"], (dir) => {
      mkdirSync(join(dir, ".harness"), { recursive: true });
      writeFileSync(join(dir, ".harness", "focus"), "change-b\n");
      const r = runReview(dir, { args: ["--dry-run"] });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("change-b のタスク本文");
      expect(r.stdout).toContain("change-b の spec 本文");
      // 宣言していない側を混ぜない。混ぜると指摘が的外れになる
      expect(r.stdout).not.toContain("change-a のタスク本文");
      // 差分そのものと、[x] の突き合わせを求める 1 行
      expect(r.stdout).toContain("export const a = 2;");
      expect(r.stdout).toContain("- [x] のタスクのうち");
    });
  });

  it("--dry-run はモデルを呼ばず、受領書も所見も作らない", () => {
    withReviewRepo(["change-a"], (dir) => {
      expect(runReview(dir, { args: ["--dry-run"] }).status).toBe(0);
      expect(existsSync(join(dir, ".harness", "reviews"))).toBe(false);
      expect(existsSync(join(dir, "openspec", "changes", "change-a", "reviews.md"))).toBe(false);
    });
  });

  it("findings が空なら受領書を作り、reviews.md にも残す（D4）", () => {
    withReviewRepo(["change-a"], (dir) => {
      const bin = fakeClaude(dir, { findings: [], body: "所見: 問題は見つからなかった" });
      const r = runReview(dir, { bin });
      expect(r.status).toBe(0);
      const hash = diffHash(dir);
      expect(existsSync(join(dir, ".harness", "reviews", `${hash}.json`))).toBe(true);
      const md = readFileSync(join(dir, "openspec", "changes", "change-a", "reviews.md"), "utf8");
      expect(md).toContain(`hash=${hash}`);
      expect(md).toContain("findings=0");
      expect(md).toContain("所見: 問題は見つからなかった");
    });
  });

  it("findings があれば受領書は作らないが、reviews.md には残す（D4）", () => {
    withReviewRepo(["change-a"], (dir) => {
      const bin = fakeClaude(dir, {
        findings: [{ file: "code.ts", line: 1, summary: "await が抜けている" }],
        body: "所見: 1 件",
      });
      const r = runReview(dir, { bin });
      expect(r.status).not.toBe(0);
      expect(existsSync(join(dir, ".harness", "reviews"))).toBe(false);
      const md = readFileSync(join(dir, "openspec", "changes", "change-a", "reviews.md"), "utf8");
      expect(md).toContain("findings=1");
      expect(md).toContain("await が抜けている");
      expect(md).toContain("所見: 1 件");
    });
  });

  it("2 回レビューすると reviews.md は追記される（上書きしない）", () => {
    withReviewRepo(["change-a"], (dir) => {
      const bin = fakeClaude(dir, { findings: [], body: "所見" });
      expect(runReview(dir, { bin }).status).toBe(0);
      writeFileSync(join(dir, "code.ts"), "export const a = 3;\n");
      spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
      expect(runReview(dir, { bin }).status).toBe(0);
      const md = readFileSync(join(dir, "openspec", "changes", "change-a", "reviews.md"), "utf8");
      expect(md.match(/^## /gm)).toHaveLength(2);
    });
  });
});

describe("レビュー自身の書き込みは自分の受領書を無効にしない（D6）", () => {
  it("reviews.md を書き換えても差分のハッシュは変わらない", () => {
    withReviewRepo(
      ["change-a"],
      (dir) => {
        const before = diffHash(dir);
        expect(before).not.toBe("");
        const reviews = join(dir, "openspec", "changes", "change-a", "reviews.md");
        writeFileSync(reviews, "## 所見\n");
        spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
        expect(diffHash(dir)).toBe(before);
        // コードを触ればハッシュは動く。除外が効きすぎていないことを見る
        writeFileSync(join(dir, "code.ts"), "export const a = 99;\n");
        spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
        expect(diffHash(dir)).not.toBe(before);
      },
      ["change-a"],
    );
  });

  it("レビューに渡す差分に reviews.md は入らない（前回の所見を読み返させない）", () => {
    withReviewRepo(
      ["change-a"],
      (dir) => {
        writeFileSync(
          join(dir, "openspec", "changes", "change-a", "reviews.md"),
          "## 前回のレビュー\n\nここは差分に入ってはならない\n",
        );
        spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
        const out = runReview(dir, { args: ["--dry-run"] }).stdout;
        expect(out).toContain("export const a = 2;");
        expect(out).not.toContain("ここは差分に入ってはならない");
      },
      ["change-a"],
    );
  });

  it("レビューのあと reviews.md は index に載っていて、門が部分ステージで止めない", () => {
    withReviewRepo(
      ["change-a"],
      (dir) => {
        // 門は検査を全部走らせる。落ちない package.json を置く
        writeFileSync(
          join(dir, "package.json"),
          `${JSON.stringify(
            { name: "f", private: true, scripts: { "check:types": "exit 0" } },
            null,
            2,
          )}\n`,
        );
        spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
        const bin = fakeClaude(dir, { findings: [], body: "所見" });
        expect(runReview(dir, { bin }).status).toBe(0);
        // 追記したファイルが未ステージのまま残っていない
        expect(spawnSync("git", ["diff", "--quiet"], { cwd: dir }).status).toBe(0);
        expect(runGate(dir, 'git commit -m "変更"')).toBe(0);
      },
      ["change-a"],
    );
  });
});
