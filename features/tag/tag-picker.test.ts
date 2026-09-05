import { describe, expect, it } from "vitest";
import { MAX_TAG_NAME_LENGTH } from "./tag-text";
import { enterTarget, pickerView, type TagOption } from "./tag-picker";

const ALL: TagOption[] = [
  { id: "1", name: "仕事" },
  { id: "2", name: "生活" },
  { id: "3", name: "読書" },
  { id: "4", name: "雑貨" },
];

describe("選び手に出すもの", () => {
  it("打っていないときは、いま付いているもの以外を全部出す", () => {
    const v = pickerView(ALL, "2", "");
    expect(v.matches.map((t) => t.name)).toEqual(["仕事", "読書", "雑貨"]);
    expect(v.createName).toBeNull();
  });

  it("打つと絞り込まれる", () => {
    expect(pickerView(ALL, undefined, "書").matches.map((t) => t.name)).toEqual(["読書"]);
  });

  it("完全に一致する既存があれば、つくる手段を出さない", () => {
    // 同じ名前のタグが2つできる余地を画面から消す（spec の要件）
    expect(pickerView(ALL, undefined, "仕事").createName).toBeNull();
  });

  it("いま付いているタグと完全一致でも、つくる手段は出さない", () => {
    const v = pickerView(ALL, "2", "生活");
    expect(v.matches).toEqual([]);
    expect(v.createName).toBeNull();
  });

  it("一致するものが無ければ、つくる手段を出す", () => {
    const v = pickerView(ALL, undefined, "料理");
    expect(v.matches).toEqual([]);
    expect(v.createName).toBe("料理");
  });

  it("前後の空白は落として比べる", () => {
    // 落とさないと「 仕事」で「つくる」が出て、同じ名前が2つできる
    expect(pickerView(ALL, undefined, " 仕事 ").createName).toBeNull();
    expect(pickerView(ALL, undefined, " 料理 ").createName).toBe("料理");
  });

  it("空白だけなら、つくる手段を出さない", () => {
    expect(pickerView(ALL, undefined, "   ").createName).toBeNull();
  });

  it("長すぎる名前では、つくる手段を出さない", () => {
    const long = "あ".repeat(MAX_TAG_NAME_LENGTH + 1);
    expect(pickerView(ALL, undefined, long).createName).toBeNull();
  });

  it("候補が1つも無い状態でも壊れない", () => {
    expect(pickerView([], undefined, "料理")).toEqual({ matches: [], createName: "料理" });
  });
});

describe("Enter で選ばれる名前", () => {
  it("完全に一致すればそれを選ぶ", () => {
    expect(enterTarget(ALL, "仕事")).toBe("仕事");
    expect(enterTarget(ALL, " 仕事 ")).toBe("仕事");
  });

  it("一致しなければ、打った名前で作る", () => {
    expect(enterTarget(ALL, " 料理 ")).toBe("料理");
  });

  it("空や長すぎるものでは何も起きない", () => {
    expect(enterTarget(ALL, "  ")).toBeNull();
    expect(enterTarget(ALL, "あ".repeat(MAX_TAG_NAME_LENGTH + 1))).toBeNull();
  });
});
