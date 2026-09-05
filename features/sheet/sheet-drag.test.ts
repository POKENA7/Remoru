import { describe, expect, it } from "vitest";
import { CLOSE_RATIO, CLOSE_VELOCITY, canStartDrag, dragOffset, shouldClose } from "./sheet-drag";

const HEIGHT = 400;
const p = (y: number, at: number) => ({ y, at });

describe("引いた距離", () => {
  it("下へ引いた分を返す", () => {
    expect(dragOffset(p(100, 0), p(180, 50))).toBe(80);
  });

  it("上へは引けない", () => {
    // 負を許すと、シートが画面より高くなる形が生まれる
    expect(dragOffset(p(100, 0), p(20, 50))).toBe(0);
  });
});

describe("離したときに閉じるか", () => {
  /** ゆっくり引く（速さでは閉じない）。 */
  const slow = (distance: number) => ({
    start: p(100, 0),
    previous: p(100 + distance - 1, 900),
    end: p(100 + distance, 1000),
    sheetHeight: HEIGHT,
  });

  it("十分に引けば閉じる", () => {
    expect(shouldClose(slow(HEIGHT * CLOSE_RATIO + 1))).toBe(true);
  });

  it("引き足りなければ閉じない", () => {
    expect(shouldClose(slow(HEIGHT * CLOSE_RATIO - 1))).toBe(false);
  });

  it("短くても速く弾けば閉じる", () => {
    // 距離だけで決めると、速く弾いたのに閉じない
    expect(
      shouldClose({
        start: p(100, 0),
        previous: p(110, 900),
        end: p(150, 920), // 40px を 20ms ＝ 2px/ms
        sheetHeight: HEIGHT,
      }),
    ).toBe(true);
  });

  it("ゆっくり大きく引いても閉じる", () => {
    // 速さだけで決めると、ゆっくり大きく引いたのに閉じない
    expect(shouldClose(slow(HEIGHT))).toBe(true);
  });

  it("速さの境界", () => {
    const at = (v: number) => ({
      start: p(100, 0),
      previous: p(110, 900),
      end: p(110 + v * 20, 920),
      sheetHeight: HEIGHT,
    });
    expect(shouldClose(at(CLOSE_VELOCITY + 0.1))).toBe(true);
    expect(shouldClose(at(CLOSE_VELOCITY - 0.1))).toBe(false);
  });

  it("上へ弾いても閉じない", () => {
    expect(
      shouldClose({
        start: p(100, 0),
        previous: p(90, 900),
        end: p(20, 920),
        sheetHeight: HEIGHT,
      }),
    ).toBe(false);
  });

  it("動かずに離しても閉じない", () => {
    expect(
      shouldClose({
        start: p(100, 0),
        previous: p(100, 900),
        end: p(100, 1000),
        sheetHeight: HEIGHT,
      }),
    ).toBe(false);
  });
});

describe("引き始めてよいか", () => {
  it("中身が一番上なら引ける", () => {
    expect(canStartDrag({ fromGrip: false, scrollTop: 0 })).toBe(true);
  });

  it("途中まで読んでいたら引けない", () => {
    // 読もうとして下げただけで閉じる、を避ける（design.md D3）
    expect(canStartDrag({ fromGrip: false, scrollTop: 120 })).toBe(false);
  });

  it("掴み手からは中身に関わらず引ける", () => {
    expect(canStartDrag({ fromGrip: true, scrollTop: 120 })).toBe(true);
  });
});
