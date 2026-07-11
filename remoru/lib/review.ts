import { eq, and, lte, asc } from "drizzle-orm";
import { quizItems, reviewCards } from "../db/schema";
import { calculateNextReview, type ReviewRating } from "./sm2";
import type { AppDb } from "../db/types";

const DAY_SECONDS = 24 * 60 * 60;

export async function getDueReviewCards(
  db: AppDb,
  userId: string,
  nowTs: number,
) {
  return db
    .select({
      cardId: reviewCards.id,
      question: quizItems.question,
      answer: quizItems.answer,
      dueDate: reviewCards.dueDate,
    })
    .from(reviewCards)
    .innerJoin(quizItems, eq(reviewCards.quizItemId, quizItems.id))
    .where(and(eq(reviewCards.userId, userId), lte(reviewCards.dueDate, nowTs)))
    .orderBy(asc(reviewCards.dueDate));
}

export async function submitReview(
  db: AppDb,
  cardId: string,
  userId: string,
  rating: ReviewRating,
  nowTs: number,
) {
  const rows = await db
    .select()
    .from(reviewCards)
    .where(eq(reviewCards.id, cardId));
  const card = rows[0];
  if (!card || card.userId !== userId) throw new Error("review card not found");

  const result = calculateNextReview(
    {
      easeFactor: card.easeFactor,
      intervalDays: card.intervalDays,
      repetitions: card.repetitions,
    },
    rating,
  );

  await db
    .update(reviewCards)
    .set({
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      dueDate: nowTs + result.dueInDays * DAY_SECONDS,
      lastReviewedAt: nowTs,
    })
    .where(eq(reviewCards.id, cardId));

  return result;
}
