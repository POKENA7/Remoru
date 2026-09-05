import { describe, expect, it } from "vitest";
import { stateLabel } from "./detail-selection";
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
