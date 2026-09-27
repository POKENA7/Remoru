import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 実装担当（scripts/delegate.sh）の権限を強制する opencode.json の検査。
 *
 * 禁止はプロンプトの指示ではなく権限そのものに置く。指示が守られるかどうかは
 * モデルの判断に委ねられるが、deny はツールの実行前に機械が止める。ここが緩むと、
 * 実装担当が自分でレビューを通す、本番の D1 に触る、という取り返しのつかない経路が開く。
 *
 * L06 に従い、「opencode.json から 1 つ消すと赤くなる」ことを実際に確かめてある
 * （`git add*` の deny を消してこのテストが落ちるのを見た）。このテストは
 * deny の一覧を**列挙**し、opencode.json から消えたときに赤くなる役目を持つ。
 */

const CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../opencode.json", import.meta.url)), "utf8"),
);

/**
 * 実装担当に禁じる bash のパターン。1 つでも消えたら赤くなる。
 *
 * 既定（`*`）が allow なのは、実装担当に `npm run check` や `openspec` を打たせるため。
 * その上で、書き込み・破壊的操作・受領書とゲート・本番への操作だけを deny で塞ぐ。
 */
const DENIED = [
  "git commit*",
  "git push*",
  "git reset*",
  "git restore*",
  "git checkout*",
  "git switch*",
  "git clean*",
  "git rebase*",
  "git merge*",
  "git stash*",
  "git add*",
  "git worktree*",
  "sudo*",
  "openspec archive*",
  "openspec init*",
  "openspec update*",
  "npm run harness:review*",
  "bash scripts/harness/review.sh*",
  "npm run harness:promote*",
  "wrangler*",
  "npx wrangler*",
];

describe("実装担当の権限（opencode.json）", () => {
  const bash: Record<string, string> = CONFIG.permission?.bash ?? {};

  it("bash の既定は許可になっている（実行の入口を塞がない）", () => {
    expect(bash["*"]).toBe("allow");
  });

  it.each(DENIED)("bash の %s を拒む", (pattern) => {
    expect(bash[pattern]).toBe("deny");
  });

  it("レビュー担当のエージェントを持たない（レビューは review.sh が担う）", () => {
    expect(CONFIG.agent?.reviewer).toBeUndefined();
  });
});
