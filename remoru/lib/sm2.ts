export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface SM2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface SM2Result extends SM2State {
  dueInDays: number;
}

const RATING_QUALITY: Record<ReviewRating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export function calculateNextReview(
  state: SM2State,
  rating: ReviewRating,
): SM2Result {
  const quality = RATING_QUALITY[rating];
  let repetitions = state.repetitions;
  let intervalDays: number;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(state.intervalDays * state.easeFactor);
    }
    repetitions += 1;
  }

  let easeFactor =
    state.easeFactor +
    (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  return { easeFactor, intervalDays, repetitions, dueInDays: intervalDays };
}
