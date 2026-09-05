import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * シートの閉じ方を検査で固定する。
 *
 * 出口は4つ ―― 外側・引く・ボタン・Escape。**引く操作だけにしない**
 * （`sheet` の要件）。引けない利用者がいて、掴み手は見落とされやすい。
 *
 * 以前は2つのシートが別々に外枠を書いており、閉じ方を足すと片方だけ直した
 * ときに静かにずれた。外枠を1つにしたことを、ここで固定する。
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(p, "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * **対象を名前で決めず、内容で選ぶ**（component-directories D5）。
 *
 * 以前は `app/memo-detail.tsx` `app/quiz-sheet.tsx` を名指ししていた。
 * 置き場が変わると落ちるのは良いが、**利用者が増えたときに気づけない**——
 * 3 つ目のシートを足しても、この一覧に書き忘れれば検査されない。
 *
 * `<Sheet` を使っている部品を走査して集める。増えたら自動的に対象になる。
 */
function componentFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "api") continue;
        walk(full);
      } else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
        out.push(full);
      }
    }
  };
  for (const r of [join(ROOT, "features"), join(ROOT, "app")]) walk(r);
  return out;
}

// `endsWith("sheet.tsx")` だと quiz-sheet.tsx にも当たる。基準名で厳密に見る
const SHEET_SRC = componentFiles().find((f) => f.split("/").pop() === "sheet.tsx");
const sheet = codeOnly(read(SHEET_SRC ?? ""));
const css = read(join(ROOT, "app", "globals.css"));

/** `<Sheet` を使っている部品。名指しではなく内容で選ぶ */
const USERS = componentFiles().filter((f) => f !== SHEET_SRC && /<Sheet\b/.test(read(f)));

describe("外枠は1つだけ", () => {
  it("走査で外枠そのものが見つかる", () => {
    // 起点を間違えて見つからないと、下の検査は空文字を相手にして緑になる
    expect(SHEET_SRC).toBeDefined();
  });

  it("走査対象が空でない", () => {
    expect(USERS.length).toBeGreaterThan(1);
  });

  it("シートの外枠を書いているのは sheet.tsx だけ", () => {
    for (const f of USERS) {
      expect(codeOnly(read(f)), `${f} が外枠を自前で書いている`).not.toMatch(
        /className="sheet-backdrop"/,
      );
    }
    expect(sheet).toMatch(/className="sheet-backdrop"/);
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
    // 増やすのであって、置き換えるのではない（spec の要件）。
    // シートを使う部品はどれも、閉じる語を自分で持っている
    for (const f of USERS) {
      expect(read(f), `${f} に閉じる言葉が無い`).toMatch(/やめる|あとで|閉じる/);
    }
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
    expect(rm).toMatch(/\.sheet,\s*\.sheet\.dragging \{[^}]*transition: none/);
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
