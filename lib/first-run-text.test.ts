import { describe, expect, it } from "vitest";
import { announcementText } from "./first-run-text";

/** 復習日の境界は 00:00 JST（= 15:00 UTC）。時刻はすべて UTC で書く。 */
const at = (m: number, d: number, h: number) => Date.UTC(2026, m, d, h, 0, 0);

describe("告知の文言", () => {
  it("翌日の出題なら「明日」", () => {
    const now = at(7, 26, 3); // 12:00 JST
    expect(announcementText(at(7, 26, 15), now, true)).toBe(
      "明日、まだ覚えているか尋ねてもいいですか？",
    );
  });

  it("先の出題なら日数で言う", () => {
    const now = at(7, 26, 3);
    expect(announcementText(at(7, 28, 15), now, true)).toBe(
      "3日後、まだ覚えているか尋ねてもいいですか？",
    );
  });

  it("もう出題日が来ていれば日付を言わない", () => {
    const now = at(7, 27, 3);
    expect(announcementText(at(7, 26, 15), now, true)).toBe(
      "このあと、まだ覚えているか尋ねてもいいですか？",
    );
  });

  /**
   * 通知を差し出せない端末では言い切りに戻す。問いかけたまま「いいよ」が
   * 無いと、答える手段が無い問いだけが残る。
   */
  it("差し出せないときは問いかけない", () => {
    const now = at(7, 26, 3);
    const text = announcementText(at(7, 26, 15), now, false);
    expect(text).toBe("明日、まだ覚えているか尋ねます");
    expect(text).not.toContain("？");
  });

  /**
   * 23時に書いた直後の告知。
   *
   * 時刻の差で割ると 1時間 → 0日 になり「このあと」と言ってしまう。
   * 出題日は日境界で決まっているので、同じ境界で引かなければならない。
   */
  it("23時に書いた直後でも「明日」と言う", () => {
    const written = at(7, 26, 14); // 23:00 JST
    const nextReviewAt = at(7, 26, 15); // 翌 00:00 JST

    expect(announcementText(nextReviewAt, written, true)).toBe(
      "明日、まだ覚えているか尋ねてもいいですか？",
    );

    // 時刻の差で割った場合との違いを明示する
    const naive = Math.round((nextReviewAt - written) / 86_400_000);
    expect(naive).toBe(0);
  });

  it("日をまたいだ直後は「このあと」に変わる", () => {
    const nextReviewAt = at(7, 26, 15); // 00:00 JST
    expect(announcementText(nextReviewAt, at(7, 26, 15) + 1800_000, true)).toBe(
      "このあと、まだ覚えているか尋ねてもいいですか？",
    );
  });
});
