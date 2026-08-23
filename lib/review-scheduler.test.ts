import { describe, it, expect } from "vitest";
import {
  schedule,
  initialSchedule,
  startOfReviewDay,
  parseState,
  serializeState,
  type SchedulerState,
} from "./review-scheduler";

const DAY = 24 * 60 * 60 * 1000;

/** 2026-08-23 12:00 JST */
const NOW = Date.UTC(2026, 7, 23, 3, 0, 0);

/** now が属する復習日の N 日後の 00:00 */
const daysLater = (now: number, n: number) => startOfReviewDay(now) + n * DAY;

/** 結果を「何日後か」で読めるようにする */
const intervalDays = (now: number, nextReviewAt: number) =>
  (nextReviewAt - startOfReviewDay(now)) / DAY;

const ok = { recalled: true };
const ng = { recalled: false };

describe("startOfReviewDay", () => {
  it("JST の 00:00 に丸める", () => {
    // 2026-08-23 00:00 JST = 2026-08-22 15:00 UTC
    expect(startOfReviewDay(NOW)).toBe(Date.UTC(2026, 7, 22, 15, 0, 0));
  });

  it("同じ日のどの時刻でも同じ境界になる", () => {
    const morning = Date.UTC(2026, 7, 23, 0, 0, 0); //  9:00 JST
    const night = Date.UTC(2026, 7, 23, 14, 59, 0); // 23:59 JST
    expect(startOfReviewDay(morning)).toBe(startOfReviewDay(night));
  });

  it("JST の日付が変わると境界も変わる", () => {
    const before = Date.UTC(2026, 7, 23, 14, 59, 0); // 8/23 23:59 JST
    const after = Date.UTC(2026, 7, 23, 15, 1, 0); //  8/24 00:01 JST
    expect(startOfReviewDay(after) - startOfReviewDay(before)).toBe(DAY);
  });
});

describe("initialSchedule", () => {
  it("問答を作ると最初の出題は1日後", () => {
    const r = initialSchedule(NOW);
    expect(r.state).toEqual({ stage: 0, recoverTo: null });
    expect(r.nextReviewAt).toBe(daysLater(NOW, 1));
  });
});

describe("覚えていた場合（タスク 2.2）", () => {
  it("段階を 1 → 3 → 7 → 14 → 30 と順に上がる", () => {
    let state: SchedulerState = initialSchedule(NOW).state;
    const seen: number[] = [];

    for (let i = 0; i < 5; i++) {
      const r = schedule(state, ok, NOW);
      seen.push(intervalDays(NOW, r.nextReviewAt));
      state = r.state;
    }

    expect(seen).toEqual([3, 7, 14, 30, 30]);
  });

  it("最終段階に達したら30日を維持する", () => {
    let state: SchedulerState = { stage: 4, recoverTo: null };
    for (let i = 0; i < 3; i++) {
      const r = schedule(state, ok, NOW);
      expect(intervalDays(NOW, r.nextReviewAt)).toBe(30);
      expect(r.state.stage).toBe(4);
      state = r.state;
    }
  });
});

describe("忘れていた場合（タスク 2.3）", () => {
  it("段階4（14日）で失敗すると次は1日後、復帰先は段階3", () => {
    const state: SchedulerState = { stage: 3, recoverTo: null };

    const r = schedule(state, ng, NOW);

    expect(intervalDays(NOW, r.nextReviewAt)).toBe(1);
    expect(r.state).toEqual({ stage: 0, recoverTo: 2 });
  });

  it("復帰時は7日後に飛び、1日・3日を経由しない", () => {
    const failed = schedule({ stage: 3, recoverTo: null }, ng, NOW);

    const recovered = schedule(failed.state, ok, NOW);

    expect(intervalDays(NOW, recovered.nextReviewAt)).toBe(7);
    expect(recovered.state).toEqual({ stage: 2, recoverTo: null });
  });

  it("復帰後は通常の前進に戻る", () => {
    const failed = schedule({ stage: 3, recoverTo: null }, ng, NOW);
    const recovered = schedule(failed.state, ok, NOW);

    const after = schedule(recovered.state, ok, NOW);

    expect(intervalDays(NOW, after.nextReviewAt)).toBe(14);
  });

  it("一律に最初へ戻さない（節約効果を反映している）", () => {
    // 段階4で失敗 → 復帰 の間隔が、初回の 1日 → 3日 とは異なること
    const failed = schedule({ stage: 3, recoverTo: null }, ng, NOW);
    const recovered = schedule(failed.state, ok, NOW);
    expect(intervalDays(NOW, recovered.nextReviewAt)).not.toBe(3);
  });
});

describe("段階1で忘れていた場合（タスク 2.4）", () => {
  it("次は1日後、復帰先は段階1のまま", () => {
    const r = schedule({ stage: 0, recoverTo: null }, ng, NOW);

    expect(intervalDays(NOW, r.nextReviewAt)).toBe(1);
    expect(r.state).toEqual({ stage: 0, recoverTo: 0 });
  });

  it("復帰後も一度1日後に出る（design.md D3 の意図した挙動）", () => {
    const failed = schedule({ stage: 0, recoverTo: null }, ng, NOW);

    const recovered = schedule(failed.state, ok, NOW);

    expect(intervalDays(NOW, recovered.nextReviewAt)).toBe(1);
    expect(recovered.state).toEqual({ stage: 0, recoverTo: null });
  });

  it("そのあとは通常どおり3日後へ進む", () => {
    const failed = schedule({ stage: 0, recoverTo: null }, ng, NOW);
    const recovered = schedule(failed.state, ok, NOW);

    const after = schedule(recovered.state, ok, NOW);

    expect(intervalDays(NOW, after.nextReviewAt)).toBe(3);
  });
});

describe("状態の永続化", () => {
  it("往復しても変わらない", () => {
    const state: SchedulerState = { stage: 3, recoverTo: 1 };
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it("壊れた値は最初の段階として扱う", () => {
    expect(parseState("{{{")).toEqual({ stage: 0, recoverTo: null });
    expect(parseState('{"stage":99}')).toEqual({ stage: 0, recoverTo: null });
  });
});

describe("時計を内部で読まない（design.md D1）", () => {
  it("同じ入力なら何度呼んでも同じ結果になる", () => {
    const state: SchedulerState = { stage: 2, recoverTo: null };
    const a = schedule(state, ok, NOW);
    const b = schedule(state, ok, NOW);
    expect(a).toEqual(b);
  });
});
