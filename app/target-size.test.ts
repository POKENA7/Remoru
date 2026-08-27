import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 押せるものの的の大きさを検査で固定する。
 *
 * change 13 の実測で、メモ詳細の「つくり直す」が 60×21、「消す」が 44×30
 * だった。同じ画面の戻る・タグ・候補の行は 44px を確保していたので、
 * **この2つだけが確保していなかった**。見落としは繰り返すので検査にする。
 */

const css = readFileSync("app/globals.css", "utf8");

/**
 * そのクラスに効く宣言をまとめて返す。
 *
 * **セレクタの並びの途中にあるものも拾う。** `.tag-open, .tag-x { ... }` の
 * ように共有された規則から 44px を得ているものがあり、先頭だけを見ると
 * 見落とす（この検査自身が最初それで落ちた）。
 */
function ruleFor(cls: string): string | null {
  const found: string[] = [];
  for (const m of css.matchAll(/(^|\n)([^@{}\n][^{}]*)\{([^}]*)\}/g)) {
    const selectors = m[2].split(",").map((x) => x.trim());
    if (selectors.some((sel) => new RegExp(`(^|[\\s>+~])\\.${cls}(?![\\w-])`).test(sel))) {
      found.push(m[3]);
    }
  }
  return found.length > 0 ? found.join("\n") : null;
}

/** 44px 以上を確保しているか。高さは min-height か padding で作る。 */
function reserves44(block: string): boolean {
  return /min-height:\s*44px/.test(block);
}

describe("メモ詳細の押せるものは 44px を確保する", () => {
  const required = [
    ["back", "戻る"],
    ["head-del", "消す"],
    ["pencil", "書き直す鉛筆"],
    ["tag-open", "タグを開く"],
    ["tag-x", "タグを外す"],
    ["tag-add", "タグを付ける"],
    ["picker-row", "候補の行"],
  ] as const;

  for (const [cls, name] of required) {
    it(`${name}（.${cls}）`, () => {
      const block = ruleFor(cls);
      expect(block, `.${cls} の規則が見つからない`).not.toBeNull();
      expect(reserves44(block!), `.${cls} が 44px を確保していない`).toBe(true);
    });
  }

  it("下線だけの文字ボタンを詳細に置かない", () => {
    // 「つくり直す」「消す」がこの形で、的が小さく、色も戻ると同じだった
    const detail = readFileSync("app/memo-detail.tsx", "utf8");
    expect(detail).not.toMatch(/className="redo"/);
    expect(detail).not.toMatch(/className="detail-foot"/);
  });

  it("消すは他と違う色を使う", () => {
    // 取り消せない操作を、そうでない操作と同じ見た目にしない（spec の要件）
    expect(ruleFor("head-del")).toMatch(/color:\s*var\(--danger\)/);
  });
});

describe("2版は地に載せる色を使う", () => {
  it("問と答の版に淡色や塗りの色を使わない", () => {
    /*
     * 実測（`prefers-color-scheme` を CDP で切り替え、学び L03）:
     *   --orange-soft / --blue-soft   ライト 1.11 / 1.12   ← 見分けられない
     *   --orange      / --blue        ダーク 3.26 / 2.49   ← 答が基準割れ
     *   --orange-text / --blue-text   ライト 5.79 / 7.21、ダーク 7.37 / 6.65
     */
    const q = ruleFor("qa-line");
    expect(q).toMatch(/border-left:\s*3px solid var\(--orange-text\)/);
    expect(q).toMatch(/border-left-color:\s*var\(--blue-text\)/);
    expect(q).not.toMatch(/var\(--orange-soft\)|var\(--blue-soft\)/);
  });

  it("日付には版を当てない", () => {
    // 書き直しが触らないものを、形の上で分ける（design.md D2）
    const detail = readFileSync("app/memo-detail.tsx", "utf8");
    const dateLine = detail.match(/^.*次は \{formatDay.*$/m)?.[0] ?? "";
    expect(dateLine).toMatch(/className="muted"/);
    expect(dateLine).not.toMatch(/qa-line/);
  });
});
