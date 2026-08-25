import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

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

    const ownsAnswer = /useState[^;]*("done"|"failed")/.test(src);
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
