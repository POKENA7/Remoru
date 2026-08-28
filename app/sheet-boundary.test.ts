import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * シートの閉じ方を検査で固定する。
 *
 * 出口は4つ ―― 外側・引く・ボタン・Escape。**引く操作だけにしない**
 * （`sheet` の要件）。引けない利用者がいて、掴み手は見落とされやすい。
 *
 * 以前は2つのシートが別々に外枠を書いており、閉じ方を足すと片方だけ直した
 * ときに静かにずれた。外枠を1つにしたことを、ここで固定する。
 */

const read = (p: string) => readFileSync(p, "utf8");
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sheet = codeOnly(read("app/sheet.tsx"));
const css = read("app/globals.css");

describe("外枠は1つだけ", () => {
  it("シートの外枠を書いているのは sheet.tsx だけ", () => {
    for (const f of ["app/memo-detail.tsx", "app/quiz-sheet.tsx"]) {
      expect(codeOnly(read(f)), `${f} が外枠を自前で書いている`).not.toMatch(
        /className="sheet-backdrop"/,
      );
    }
    expect(sheet).toMatch(/className="sheet-backdrop"/);
  });

  it("2つのシートが同じ部品を使う", () => {
    expect(read("app/memo-detail.tsx")).toMatch(/<Sheet\b/);
    expect(read("app/quiz-sheet.tsx")).toMatch(/<Sheet\b/);
  });
});

describe("出口は4つある", () => {
  it("外側に触れると閉じる", () => {
    // 中身を押しても閉じない。当たり判定は外側だけ
    expect(sheet).toMatch(/e\.target === e\.currentTarget.*onClose\(\)/s);
  });

  it("Escape で閉じる", () => {
    expect(sheet).toMatch(/e\.key === "Escape"/);
  });

  it("引いて閉じる", () => {
    expect(sheet).toMatch(/shouldClose\(/);
    expect(sheet).toMatch(/onPointerDown=\{onPointerDown\}/);
  });

  it("閉じるボタンを取り除かない", () => {
    // 増やすのであって、置き換えるのではない（spec の要件）
    const detail = read("app/memo-detail.tsx");
    const quiz = read("app/quiz-sheet.tsx");
    expect(detail).toMatch(/やめる/);
    expect(quiz).toMatch(/rewriting \? "やめる" : "あとで"/);
  });
});

describe("引く操作の作法", () => {
  it("スクロール位置を見てから引き始める", () => {
    // 途中まで読んだ状態から引けると、下げただけで閉じる
    expect(sheet).toMatch(/canStartDrag\(\{[\s\S]*?scrollTop: sheet\.scrollTop/);
  });

  it("入力欄の中では引かない", () => {
    // カーソル移動と取り合わない
    expect(sheet).toMatch(/INPUT\|TEXTAREA/);
  });

  it("掴み手が本当に掴める", () => {
    // 以前は飾りで、引けると読める形を描いておきながら引けなかった
    expect(sheet).toMatch(/closest\("\.grip"\)/);
    expect(css).toMatch(/\.grip \{[^}]*touch-action: none/s);
  });
});

describe("動きを止めた人", () => {
  it("追随も戻りも出さない", () => {
    const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  /* 追随も戻り"));
    expect(rm).toMatch(/\.sheet, \.sheet\.dragging \{[^}]*transition: none/);
    expect(rm).toMatch(/transform: none !important/);
  });
});

describe("焦点を戻す", () => {
  it("開く前の場所へ戻す", () => {
    expect(sheet).toMatch(/document\.activeElement/);
    expect(sheet).toMatch(/opener\.current\?\.isConnected/);
    expect(sheet).toMatch(/opener\.current\.focus/);
  });
});
