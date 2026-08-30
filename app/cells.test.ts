import { describe, expect, it } from "vitest";
import { cellFills as fills } from "./cells";

// 規則の説明は app/cells.ts を参照。ここでは境界を固定する。

describe("進捗マス", () => {
  it("1枚のときは1マス", () => {
    expect(fills(1, 0)).toEqual([0]);
    expect(fills(1, 1)).toEqual([1]);
  });

  it("5枚のときは5マスで1マス=1枚", () => {
    expect(fills(5, 0)).toEqual([0, 0, 0, 0, 0]);
    expect(fills(5, 2)).toEqual([1, 1, 0, 0, 0]);
    expect(fills(5, 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("10枚まではマス数が枚数と一致する", () => {
    for (let n = 1; n <= 10; n++) expect(fills(n, 0)).toHaveLength(n);
  });

  it("20枚でも10マスに収まり、途中のマスが半分塗られる", () => {
    const f = fills(20, 7);
    expect(f).toHaveLength(10);
    expect(f.slice(0, 3)).toEqual([1, 1, 1]);
    expect(f[3]).toBeCloseTo(0.5); // 1マス=2枚、7枚目は4マス目の半分
    expect(f.slice(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("50枚でも10マスに収まる", () => {
    const f = fills(50, 23);
    expect(f).toHaveLength(10);
    expect(f.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(f[4]).toBeCloseTo(0.6); // 1マス=5枚、23枚目は5マス目の6割
  });

  it("どの枚数でもマスは10個を超えない（溢れない）", () => {
    for (const n of [11, 20, 37, 50, 100, 999]) {
      expect(fills(n, 0).length).toBeLessThanOrEqual(10);
    }
  });

  it("塗りは常に0〜1に収まる（潰れない）", () => {
    for (const n of [1, 5, 20, 50, 100]) {
      for (const d of [0, 1, Math.floor(n / 2), n]) {
        for (const v of fills(n, d)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("全部終えると全マスが埋まる", () => {
    for (const n of [1, 5, 20, 50]) {
      expect(fills(n, n).every((v) => v === 1)).toBe(true);
    }
  });
});
