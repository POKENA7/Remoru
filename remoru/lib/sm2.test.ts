import { describe, expect, it } from "vitest";
import { calculateNextReview } from "./sm2";

describe("calculateNextReview", () => {
  it("resets repetitions and interval to 1 day on 'again'", () => {
    const result = calculateNextReview(
      { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
      "again",
    );
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.dueInDays).toBe(1);
  });

  it("sets interval to 1 day on the first successful review", () => {
    const result = calculateNextReview(
      { easeFactor: 2.5, intervalDays: 0, repetitions: 0 },
      "good",
    );
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it("sets interval to 6 days on the second successful review", () => {
    const result = calculateNextReview(
      { easeFactor: 2.5, intervalDays: 1, repetitions: 1 },
      "good",
    );
    expect(result.intervalDays).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("multiplies interval by ease factor on the third+ successful review", () => {
    const result = calculateNextReview(
      { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
      "good",
    );
    expect(result.intervalDays).toBe(15); // round(6 * 2.5)
    expect(result.repetitions).toBe(3);
  });

  it("never lets ease factor drop below 1.3", () => {
    let state = { easeFactor: 1.3, intervalDays: 6, repetitions: 2 };
    for (let i = 0; i < 5; i++) {
      state = calculateNextReview(state, "again");
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("increases ease factor on 'easy' ratings", () => {
    const result = calculateNextReview(
      { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
      "easy",
    );
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });
});
