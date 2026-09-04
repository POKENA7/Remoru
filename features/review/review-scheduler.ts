/**
 * 復習スケジューラ。
 *
 * このモジュールは HTTP・セッション・データベース・フレームワークのいずれも
 * import しない（design.md D2 / lib/scheduler-boundary.test.ts で担保）。
 * 現在時刻は引数で受け取り、内部で時計を読まない（D1）。
 *
 * 外へ出すのは次回出題日だけで、`SchedulerState` の中身は不透明として扱う。
 * SM-2 系へ差し替えるとき変わるのはこのファイルと state の形だけになる。
 */

/** 出題間隔（日）。段階の添字がそのまま SchedulerState.stage。 */
const INTERVALS_IN_DAYS = [1, 3, 7, 14, 30] as const;

const LAST_STAGE = INTERVALS_IN_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 復習日の境界に使うタイムゾーンのオフセット（分）。
 *
 * Asia/Tokyo は夏時間がないため固定値で厳密に扱える。利用者ごとの
 * タイムゾーンは認証を導入する change 3 以降の課題。
 */
const REVIEW_DAY_OFFSET_MINUTES = 9 * 60;

/** スケジューラの内部状態。この形に依存してよいのはこのモジュールだけ。 */
export type SchedulerState = {
  /** 現在適用されている間隔の段階（INTERVALS_IN_DAYS の添字）。 */
  stage: number;
  /**
   * 失敗からの復帰時に戻る段階。null なら通常の前進。
   * 節約効果（再学習は初回より速い）を段階の飛ばしとして表現している。
   */
  recoverTo: number | null;
};

/** 利用者から観測できる復習結果。アルゴリズム固有の評点を境界に置かない。 */
export type ReviewOutcome = { recalled: boolean };

export type ScheduleResult = {
  state: SchedulerState;
  /** 次回出題日の開始時刻（エポックミリ秒）。 */
  nextReviewAt: number;
};

/** その時刻が属する復習日の開始（00:00）をエポックミリ秒で返す。 */
export function startOfReviewDay(now: number): number {
  const offsetMs = REVIEW_DAY_OFFSET_MINUTES * 60_000;
  return Math.floor((now + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
}

function scheduleAtStage(stage: number, now: number): number {
  return startOfReviewDay(now) + INTERVALS_IN_DAYS[stage] * DAY_MS;
}

/** 問と答が作られた直後の状態と、最初の出題日を返す。 */
export function initialSchedule(now: number): ScheduleResult {
  const state: SchedulerState = { stage: 0, recoverTo: null };
  return { state, nextReviewAt: scheduleAtStage(state.stage, now) };
}

/**
 * 復習結果を受けて、次の状態と出題日を決める。
 *
 * 失敗時は次を1日後に置き（忘却直後の低下がもっとも急であるため）、
 * 復帰先を失敗した段階の1つ前にする（再学習は初回より速いため）。
 * 一律に最初の段階へ戻すことはしない。
 */
export function schedule(
  state: SchedulerState,
  outcome: ReviewOutcome,
  now: number,
): ScheduleResult {
  if (!outcome.recalled) {
    const next: SchedulerState = {
      stage: 0,
      recoverTo: Math.max(state.stage - 1, 0),
    };
    return { state: next, nextReviewAt: scheduleAtStage(next.stage, now) };
  }

  const stage = state.recoverTo !== null ? state.recoverTo : Math.min(state.stage + 1, LAST_STAGE);

  const next: SchedulerState = { stage, recoverTo: null };
  return { state: next, nextReviewAt: scheduleAtStage(stage, now) };
}

/** 永続化された状態文字列を読み戻す。壊れていれば最初の段階として扱う。 */
export function parseState(raw: string): SchedulerState {
  try {
    const v = JSON.parse(raw) as Partial<SchedulerState>;
    const stage =
      typeof v.stage === "number" && v.stage >= 0 && v.stage <= LAST_STAGE ? v.stage : 0;
    const recoverTo =
      typeof v.recoverTo === "number" && v.recoverTo >= 0 && v.recoverTo <= LAST_STAGE
        ? v.recoverTo
        : null;
    return { stage, recoverTo };
  } catch {
    return { stage: 0, recoverTo: null };
  }
}

export function serializeState(state: SchedulerState): string {
  return JSON.stringify(state);
}

/** テストと表示のための読み取り専用ビュー。分岐に使わないこと。 */
export const INTERVALS = INTERVALS_IN_DAYS;
