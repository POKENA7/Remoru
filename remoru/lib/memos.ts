import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { memos, quizItems, reviewCards } from "../db/schema";
import type { AppDb } from "../db/types";

const ONE_DAY_SECONDS = 24 * 60 * 60;

export interface CreateManualMemoParams {
  userId: string;
  content: string;
  question: string;
  answer: string;
}

export async function createManualMemo(
  db: AppDb,
  params: CreateManualMemoParams,
) {
  const now = Math.floor(Date.now() / 1000);
  const memoId = randomUUID();
  const quizItemId = randomUUID();
  const reviewCardId = randomUUID();

  await db.insert(memos).values({
    id: memoId,
    userId: params.userId,
    content: params.content,
    quizMode: "manual",
    createdAt: now,
  });

  await db.insert(quizItems).values({
    id: quizItemId,
    memoId,
    question: params.question,
    answer: params.answer,
    status: "ready",
  });

  await db.insert(reviewCards).values({
    id: reviewCardId,
    quizItemId,
    userId: params.userId,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    dueDate: now + ONE_DAY_SECONDS,
    lastReviewedAt: null,
  });

  return { memoId, quizItemId, reviewCardId };
}
