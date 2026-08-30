import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * spec「問、次回の出題日、および問答に対する操作を一覧に示しては
 * MUST NOT ならない」を検査で固定する。
 *
 * これは**静かに戻る種類の要件**で、「一覧にも日付が欲しい」と言われたら
 * 1行で復活する。復活すること自体は構わないが、そのときは spec を先に
 * 変えてほしい。ここが落ちたら、その合図。
 */

const SOURCE = readFileSync(join(process.cwd(), "app", "memo-tab.tsx"), "utf8");

/** コメントを除いた本体だけを返す。言及と使用を区別するため。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("一覧が持たないもの", () => {
  const code = codeOnly(SOURCE);

  it("問の文言を読んでいない", () => {
    expect(code).not.toMatch(/\.question\b/);
  });

  it("次回の出題日を読んでいない", () => {
    expect(code).not.toMatch(/nextReviewAt/);
    expect(code).not.toMatch(/\bformatDay\b/);
  });

  it("問答への操作を持っていない", () => {
    // つくり直す・問と答をつくる・削除は詳細にある
    expect(code).not.toMatch(/quiz-item/);
    expect(code).not.toMatch(/QuizSheet/);
    expect(code).not.toMatch(/method:\s*["']DELETE["']/);
  });
});
