import { describe, expect, it } from "vitest";
import { announcement } from "./first-run-view";
import type { MemoRow } from "./types";

const NOW = Date.UTC(2026, 7, 26, 3, 0, 0);
const TOMORROW = Date.UTC(2026, 7, 26, 15, 0, 0);

function memo(id: string, review: MemoRow["review"], createdAt = NOW): MemoRow {
  return { id, userId: "u1", content: `メモ ${id}`, createdAt, review, tags: [] };
}

describe("告知", () => {
  it("初めて問答を持ったときに出す", () => {
    const result = announcement({
      guided: false,
      memos: [memo("m1", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" })],
      now: NOW,
    });
    expect(result).toEqual({ memoId: "m1", nextReviewAt: TOMORROW, now: NOW });
  });

  it("生成が終わるまでは出さない", () => {
    expect(
      announcement({ guided: false, memos: [memo("m1", { kind: "generating" })], now: NOW }),
    ).toBeNull();
  });

  it("生成に失敗しただけでは出さない", () => {
    expect(
      announcement({ guided: false, memos: [memo("m1", { kind: "unwritten" })], now: NOW }),
    ).toBeNull();
  });

  it("失敗のあと次のメモで出る", () => {
    const result = announcement({
      guided: false,
      memos: [
        memo("m2", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" }, NOW + 1000),
        memo("m1", { kind: "unwritten" }, NOW),
      ],
      now: NOW,
    });
    expect(result?.memoId).toBe("m2");
  });

  it("導きを終えていれば出さない", () => {
    expect(
      announcement({
        guided: true,
        memos: [memo("m1", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" })],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("生成前に何件か書かれていても、最も古い1件に付く", () => {
    // 「1件のときだけ」にすると、この場合に告知が永久に出ない
    const result = announcement({
      guided: false,
      memos: [
        memo("m3", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" }, NOW + 2000),
        memo("m2", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" }, NOW + 1000),
        memo("m1", { kind: "scheduled", nextReviewAt: TOMORROW, question: "問" }, NOW),
      ],
      now: NOW,
    });
    expect(result?.memoId).toBe("m1");
  });
});
