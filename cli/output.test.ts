import { describe, expect, it } from "vitest";
import type { AddResult, ApiMemo, ApiMemoDetail } from "./api.ts";
import {
  formatDay,
  formatDryRun,
  formatMemo,
  formatMemoDetail,
  formatResumeAt,
  formatTag,
  loginFailureMessage,
  oneLine,
  reasonLabel,
  reportAdd,
  reviewLabel,
} from "./output.ts";

const MEMO: ApiMemo = {
  id: "m1",
  content: "近所のパン屋は火曜定休",
  createdAt: 1_700_000_000_000,
  tags: [{ id: "t1", name: "店" }],
  review: { kind: "scheduled", nextReviewAt: 1_700_100_000_000, question: "定休日は？" },
};

describe("oneLine", () => {
  it("最初の行だけを返す", () => {
    expect(oneLine("1行目\n2行目")).toBe("1行目");
  });

  it("長い本文を切る", () => {
    expect(oneLine("あ".repeat(100), 10)).toBe(`${"あ".repeat(10)}…`);
  });
});

describe("reasonLabel", () => {
  it("知っている語を日本語にする", () => {
    expect(reasonLabel("too_long")).toBe("本文が長すぎます");
  });

  it("知らない語はそのまま出す", () => {
    expect(reasonLabel("new_reason")).toBe("new_reason");
  });
});

describe("formatDryRun", () => {
  // 切って示すと、利用者が確認したものと送るものが変わる
  it("送る本文をそのまま出す", () => {
    const long = "あ".repeat(200);
    const lines = formatDryRun(["ひとつめ\n二行目", long]).join("\n");
    expect(lines).toContain("ひとつめ\n二行目");
    expect(lines).toContain(long);
  });
});

describe("formatMemo", () => {
  it("本文と id とタグと状態を出す", () => {
    const lines = formatMemo(MEMO).join("\n");
    expect(lines).toContain("近所のパン屋は火曜定休");
    expect(lines).toContain("id: m1");
    expect(lines).toContain("タグ: 店");
    expect(lines).toContain(
      formatDay(MEMO.review.kind === "scheduled" ? MEMO.review.nextReviewAt : 0),
    );
  });

  it("タグが無ければタグなし", () => {
    expect(formatMemo({ ...MEMO, tags: [] }).join("\n")).toContain("タグなし");
  });
});

describe("reviewLabel", () => {
  it("未作成", () => {
    expect(reviewLabel({ kind: "unwritten" })).toBe("問と答が未作成");
  });

  it("生成中", () => {
    expect(reviewLabel({ kind: "generating" })).toBe("問と答をつくっています");
  });
});

describe("formatMemoDetail", () => {
  it("問と答と次回出題日を出す", () => {
    const detail: ApiMemoDetail = { ...MEMO, answer: "火曜" };
    const lines = formatMemoDetail(detail).join("\n");
    expect(lines).toContain("問: 定休日は？");
    expect(lines).toContain("答: 火曜");
  });

  it("未作成ならその旨を出す", () => {
    const detail: ApiMemoDetail = { ...MEMO, review: { kind: "unwritten" }, answer: null };
    expect(formatMemoDetail(detail).join("\n")).toContain("問と答は未作成");
  });
});

describe("formatTag", () => {
  it("名前と件数と id を出す", () => {
    expect(formatTag({ id: "t1", name: "店", count: 3 })).toBe("店（3件）  id: t1");
  });
});

describe("formatResumeAt", () => {
  // TZ に依存しない形で確かめる。文字列そのものは固めない（L07）
  it("エポックミリ秒を人が読める日時にする", () => {
    const at = 1_700_100_000_000;
    expect(formatResumeAt(at)).toBe(
      new Date(at).toLocaleString("ja-JP", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });
});

describe("loginFailureMessage", () => {
  it("401 はトークンが違うか失効していると言う", () => {
    expect(loginFailureMessage("unauthorized", "https://example.test")).toContain("失効");
  });

  it("通信の失敗は、つながらなかったこととあて先を言う", () => {
    const message = loginFailureMessage("unreachable", "https://example.test");
    expect(message).toContain("つながらなかった");
    expect(message).toContain("https://example.test");
  });

  it("その他の失敗は確かめられなかったと言う", () => {
    expect(loginFailureMessage("failed", "https://example.test")).toContain("確かめられ");
  });
});

describe("reportAdd", () => {
  it("全部通れば0で、登録した件を示す", () => {
    const result: AddResult = { ok: true, results: [{ ok: true, memoId: "1" }] };
    const report = reportAdd(["ひとつめ"], result);
    expect(report.exitCode).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.lines[0]).toBe("1件を登録しました");
  });

  it("検証に落ちた件があれば1で、理由を示す", () => {
    const result: AddResult = {
      ok: true,
      results: [
        { ok: true, memoId: "1" },
        { ok: false, reason: "too_long" },
      ],
    };
    const report = reportAdd(["正しい", "長い"], result);
    expect(report.exitCode).toBe(1);
    expect(report.errors.join("\n")).toContain("本文が長すぎます");
  });

  it("途中で失敗したら、登録済みの件数を必ず示す", () => {
    const result: AddResult = {
      ok: false,
      status: 500,
      error: "http_500",
      results: [{ ok: true, memoId: "1" }],
    };
    const report = reportAdd(["ひとつめ", "ふたつめ"], result);
    expect(report.exitCode).toBe(1);
    expect(report.errors[0]).toContain("1件は登録済み");
  });

  it("429 のときは送れた件・送れなかった件・残り件数・再開時刻を示す", () => {
    const resumeAt = 1_700_100_000_000;
    const result: AddResult = {
      ok: false,
      status: 429,
      error: "rate_limited",
      remaining: 0,
      retryAfterSeconds: 3600,
      // 1バッチ目（2件）は保存できた。2バッチ目は結果が返っていない
      results: [
        { ok: true, memoId: "1" },
        { ok: true, memoId: "2" },
      ],
    };

    const report = reportAdd(["a", "b", "c", "d"], result, { resumeAt });

    expect(report.exitCode).toBe(1);
    const text = report.lines.join("\n");
    expect(text).toContain("2件を登録しました");
    expect(text).toContain("2件は送れませんでした");
    expect(text).toContain("この日にあと 0 件送れます");
    // 時刻は TZ に依存するので、同じ関数で組み立てた値と突き合わせる（L07）
    expect(text).toContain(formatResumeAt(resumeAt));
  });

  it("429 で retry-after が無ければ時刻を出さない", () => {
    const result: AddResult = {
      ok: false,
      status: 429,
      error: "rate_limited",
      remaining: 3,
      results: [],
    };

    const text = reportAdd(["a"], result).lines.join("\n");
    expect(text).toContain("この日にあと 3 件送れます");
    expect(text).not.toContain("再開できる");
  });
});
