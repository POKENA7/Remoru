import { describe, it, expect } from "vitest";
import { LAYERS, countByLayer, layerOf } from "./retention-layers";

describe("層の境目", () => {
  it("段階の間隔がそれぞれの層に入る", () => {
    // スケジューラの間隔は [1, 3, 7, 14, 30] 日
    expect(layerOf(1)).toBeNull();
    expect(layerOf(3)).toBeNull();
    expect(layerOf(7)?.label).toBe("1週間以上");
    expect(layerOf(14)?.label).toBe("1週間以上");
    expect(layerOf(30)?.label).toBe("1か月以上");
  });

  it("境目のちょうど上は、その層に入る", () => {
    for (const layer of LAYERS) {
      expect(layerOf(layer.minIntervalDays)?.label).toBe(layer.label);
      expect(layerOf(layer.minIntervalDays - 1)?.label).not.toBe(layer.label);
    }
  });

  it("長い間隔ほど上の層に入る", () => {
    expect(layerOf(365)?.label).toBe(LAYERS[LAYERS.length - 1].label);
  });
});

describe("層ごとの件数", () => {
  it("累積で数える。上の層のものは下の層にも入る", () => {
    // 30日の問答は「1週間空けても思い出せる」ので、1週間以上にも入る
    expect(countByLayer([1, 3, 7, 7, 14, 30, 30, 30])).toEqual([
      { label: "1週間以上", count: 6 },
      { label: "1か月以上", count: 3 },
    ]);
  });

  it("**下の層が上より小さくなることは無い**（土台が逆さまにならない）", () => {
    for (const sample of [[30, 30, 7], [30], [7, 7, 7, 30], [1, 3]]) {
      const counts = countByLayer(sample).map((l) => l.count);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
      }
    }
  });

  it("0件の層も並びに残す", () => {
    expect(countByLayer([1, 3])).toEqual([
      { label: "1週間以上", count: 0 },
      { label: "1か月以上", count: 0 },
    ]);
  });

  it("何も無くても壊れない", () => {
    expect(countByLayer([])).toHaveLength(LAYERS.length);
  });

  it("層の数を変えるのはこの1箇所で済む", () => {
    // LAYERS を増やせば、数え方も並びもそのまま追随する
    expect(countByLayer([1]).map((l) => l.label)).toEqual(LAYERS.map((l) => l.label));
  });
});
