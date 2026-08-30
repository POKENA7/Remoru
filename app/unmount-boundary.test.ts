import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `MemoTab` の unmount を越えなければならない状態を、検査で固定する。
 *
 * メモの一覧は**タブの切り替えとメモの詳細で unmount される**（app-shell の
 * 描画の分岐）。この下に置いた状態は、離れて戻ると初期値に戻る。
 *
 * 実際に3度踏んでいる。
 * - 書きかけの本文が消えた
 * - 受け取ったタグの提案が消えた（取り直しにモデルの呼び出し＝課金が要る）
 * - 通知に「いいよ」と答えたのに、戻ると同じ問いがもう一度出た（change 11）
 *
 * どれも「画面の中に持ってしまった」ことが原因で、症状だけ見ると別々に見える。
 */

const read = (p: string) => readFileSync(p, "utf8");

/** コメントを除いた本体だけを返す。言及と使用を区別するため。 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("一覧の下に置いてはいけない状態", () => {
  it("告知に答えたことを、告知自身が持たない", () => {
    const src = codeOnly(read("app/first-run-notice.tsx"));

    // 答えは prop で受け取る。自分で持つと、離れて戻ったとき問いに戻る
    expect(src).toMatch(/answer:\s*NoticeAnswer/);
    expect(src).toMatch(/onAnswer:\s*\(/);

    // 分割代入は useState の**前**にあるので、両側を見る
    const ownsAnswer =
      /const \[[^\]]*[Aa]nswer[^\]]*\]\s*=\s*useState/.test(src) ||
      /useState[^;]*("done"|"failed")/.test(src);
    expect(ownsAnswer).toBe(false);
  });

  it("答えは app-shell が持つ", () => {
    const src = codeOnly(read("app/app-shell.tsx"));
    expect(src).toMatch(/useState<NoticeAnswer>/);
    expect(src).toMatch(/answer=\{noticeAnswer\}/);
  });

  it("書きかけの本文と提案も同じ場所にある", () => {
    // 同じ穴を過去に2度踏んでいる。並べて置くことで、次に足す人が気づく
    const src = codeOnly(read("app/app-shell.tsx"));
    expect(src).toMatch(/const \[draft, setDraft\] = useState/);
    expect(src).toMatch(/const \[suggestionResult, setSuggestionResult\] = useState/);
  });
});

describe("刷りの合図（change 12）", () => {
  it("いま書いた1件を、一覧自身が持たない", () => {
    const src = codeOnly(read("app/memo-tab.tsx"));

    // mount を合図にすると、戻るたびに全行が刷られる（design.md D2）
    expect(src).toMatch(/fresh:\s*FreshMemo/);
    expect(src).toMatch(/onSaved:\s*\(/);
    expect(src).toMatch(/onPrinted:\s*\(/);

    const ownsFresh =
      /const \[[^\]]*[Ff]resh[^\]]*\]\s*=\s*useState/.test(src) ||
      /useState[^;]*[Ff]resh/.test(src);
    expect(ownsFresh).toBe(false);
  });

  it("合図は app-shell が持ち、刷ったら外す", () => {
    const src = codeOnly(read("app/app-shell.tsx"));
    expect(src).toMatch(/useState<FreshMemo>/);
    expect(src).toMatch(/onPrinted\s*=\s*useCallback\(\(\)\s*=>\s*setFresh\(null\)/);
  });

  it("刷り終えたら憶えを外している", () => {
    // 外し忘れると、次の unmount で同じ行がまた刷られる
    const src = codeOnly(read("app/memo-tab.tsx"));
    expect(src).toMatch(/classList\.add\("printing"\)/);
    expect(src).toMatch(/onPrinted\(\)/);
  });
});

describe("動きを止めた人（change 12）", () => {
  it("止めても橙の版が残る", () => {
    const css = read("app/globals.css");
    const rm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

    // 消して何も残らない形にしない（change 10 の前例）
    expect(rm).toMatch(
      /\.memo-item\.printing[\s\S]*box-shadow:\s*inset 3px 0 0 var\(--orange-text\)/,
    );
    expect(rm).toMatch(/\.memo-item\.printed[\s\S]*box-shadow:\s*inset 3px 0 0 transparent/);
    expect(rm).toMatch(/animation:\s*none/);
  });

  it("インクの層はダークで screen に反転する", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*\.memo-item\.printing::after \{\s*mix-blend-mode: screen;\s*\}/,
    );
  });
});

describe("刷りの尺と高さ（change 12）", () => {
  const css = read("app/globals.css");

  it("高さは実測した値を使う", () => {
    // 固定値を置くと、折り返す長い本文で途中が切れる（design.md D1）
    expect(css).toMatch(
      /@keyframes print-open \{\s*from \{\s*height: 0;\s*\}\s*to \{\s*height: var\(--print-h\);\s*\}/,
    );
    const src = codeOnly(read("app/memo-tab.tsx"));
    // 動かす**前**に測る。付けてから測ると 0 を測る
    const measure = src.indexOf("--print-h");
    const animate = src.indexOf('classList.add("printing")');
    expect(measure).toBeGreaterThan(-1);
    expect(measure).toBeLessThan(animate);
  });

  it("尺は中身の長さで変わらない", () => {
    // 変わると、繰り返したときにリズムが揺れる
    expect(css.match(/print-open (\d+)ms/)?.[1]).toBe("200");
    expect(css.match(/print-wipe (\d+)ms/)?.[1]).toBe("420");
    expect(css.match(/print-ink (\d+)ms/)?.[1]).toBe("420");
    // 尺に var() が混ざっていないこと（＝中身に依存しない）
    const block = css.slice(
      css.indexOf(".memo-item.printing {"),
      css.indexOf("@keyframes print-open"),
    );
    expect(block).not.toMatch(/animation:[^}]*var\(/);
  });

  it("インクは高さが開いたあとに入る", () => {
    // 同時だと、開ききる前に右端まで抜けてしまう
    // cubic-bezier に読点が入るので、行末までを見て遅延を拾う
    const delay = (name: string) =>
      css.match(new RegExp(`${name} 420ms[^;\n]*?(\\d+)ms both`))?.[1];
    expect(delay("print-wipe")).toBe("60");
    expect(delay("print-ink")).toBe("60");
  });
});
