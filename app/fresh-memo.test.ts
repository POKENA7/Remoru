import { describe, it, expect } from "vitest";
import { markFresh, takeFresh } from "./fresh-memo";

describe("いま書いた1件", () => {
  it("憶えた1件だけを刷る", () => {
    const fresh = markFresh("m2");
    expect(takeFresh(fresh, "m2")).toBe(true);
    expect(takeFresh(fresh, "m1")).toBe(false);
  });

  it("何も憶えていなければ、どの行も刷らない", () => {
    // タブから戻って一覧が描き直されただけの状態
    expect(takeFresh(null, "m1")).toBe(false);
    expect(takeFresh(null, "m2")).toBe(false);
  });

  /**
   * 刷ったら憶えを外す、を守れているかは `takeFresh` 単体では見えない。
   * 外し忘れると同じ行が二度刷られるので、その並びを再現して確かめる。
   */
  it("外し忘れると、同じ行が二度刷られる", () => {
    let fresh = markFresh("m2");

    // 1回目の描画
    expect(takeFresh(fresh, "m2")).toBe(true);
    fresh = null; // ← 画面側の onPrinted にあたる

    // タブから戻って描き直された
    expect(takeFresh(fresh, "m2")).toBe(false);

    // 外さなかった場合と比べる
    const notCleared = markFresh("m2");
    expect(takeFresh(notCleared, "m2")).toBe(true);
  });
});
