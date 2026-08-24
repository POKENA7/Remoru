import { describe, it, expect } from "vitest";
import { resolveDetail, stateLabel } from "./detail-selection";
import type { MemoRow } from "./types";

function memo(id: string): MemoRow {
  return {
    id,
    userId: "u1",
    content: `メモ ${id}`,
    createdAt: 0,
    review: { kind: "unwritten" },
    tags: [],
  };
}

describe("詳細に出すメモ", () => {
  it("開いていなければ何も返さない", () => {
    expect(resolveDetail([memo("a")], null, memo("a"))).toBeNull();
  });

  it("一覧にあれば、そちらの最新を返す", () => {
    const fresh = { ...memo("a"), content: "更新後" };
    expect(resolveDetail([fresh], "a", memo("a"))?.content).toBe("更新後");
  });

  it("一覧から消えても、最後に見えていたものを返す", () => {
    // 絞り込み中にタグを外すと、そのメモは一覧から外れる。
    // ここで null を返すと画面が無言で閉じる。
    expect(resolveDetail([], "a", memo("a"))?.id).toBe("a");
  });

  it("**別のメモは返さない**", () => {
    // 開いた直後に一覧がまだ追いついていないとき、前に開いていたメモを
    // 出してしまわないこと
    expect(resolveDetail([], "a", memo("b"))).toBeNull();
  });

  it("控えが無ければ何も返さない", () => {
    expect(resolveDetail([], "a", null)).toBeNull();
  });
});

describe("状態の読み上げ名", () => {
  it("3つの状態それぞれに名前がある", () => {
    expect(stateLabel("scheduled")).toBe("復習の予定あり");
    expect(stateLabel("generating")).toBe("問と答をつくっています");
    expect(stateLabel("unwritten")).toBe("問と答が未作成");
  });

  it("知らない状態は黙って通さない", () => {
    // 型では弾かれるが、実行時にも落ちることを確かめる
    expect(() => stateLabel("なにか" as never)).toThrow();
  });
});
