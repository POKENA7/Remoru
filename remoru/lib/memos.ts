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

export interface WorkersAiBinding {
  run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
}

export function buildQuizPrompt(content: string): string {
  return `以下のメモ本文から、後で本人が内容を思い出すための「質問」と「答え」を1組だけ生成してください。
出力は必ず次のJSON形式のみで返してください。他の文章は含めないでください。
{"question": "...", "answer": "..."}

メモ本文:
${content}`;
}

export function parseQuizResponse(raw: string): {
  question: string;
  answer: string;
} {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response did not contain JSON");
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.question !== "string" || typeof parsed.answer !== "string") {
    throw new Error("AI response missing question/answer");
  }
  return { question: parsed.question, answer: parsed.answer };
}

export async function generateQuizWithAI(
  ai: WorkersAiBinding,
  content: string,
) {
  const prompt = buildQuizPrompt(content);
  const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
  });
  const raw =
    typeof result === "string" ? result : (result as { response?: string }).response ?? "";
  return parseQuizResponse(raw);
}

// Spec §4: on AI-generation failure, retry once before giving up. This
// means at most 2 total attempts (the original call + 1 retry).
export async function generateQuizWithRetry(
  ai: WorkersAiBinding,
  content: string,
) {
  try {
    return await generateQuizWithAI(ai, content);
  } catch {
    return await generateQuizWithAI(ai, content);
  }
}

export interface CreateAiMemoParams {
  userId: string;
  content: string;
}

export async function createAiMemoShell(db: AppDb, params: CreateAiMemoParams) {
  const now = Math.floor(Date.now() / 1000);
  const memoId = randomUUID();
  const quizItemId = randomUUID();

  await db.insert(memos).values({
    id: memoId,
    userId: params.userId,
    content: params.content,
    quizMode: "ai",
    createdAt: now,
  });

  await db.insert(quizItems).values({
    id: quizItemId,
    memoId,
    question: "",
    answer: "",
    status: "pending",
  });

  return { memoId, quizItemId };
}

export async function completeAiQuizItem(
  db: AppDb,
  quizItemId: string,
  params: { userId: string },
  qa: { question: string; answer: string } | null,
) {
  const now = Math.floor(Date.now() / 1000);

  if (!qa) {
    await db
      .update(quizItems)
      .set({ status: "failed" })
      .where(eq(quizItems.id, quizItemId));
    return;
  }

  await db
    .update(quizItems)
    .set({ question: qa.question, answer: qa.answer, status: "ready" })
    .where(eq(quizItems.id, quizItemId));

  await db.insert(reviewCards).values({
    id: randomUUID(),
    quizItemId,
    userId: params.userId,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    dueDate: now + ONE_DAY_SECONDS,
    lastReviewedAt: null,
  });
}

// Spec §4: after an AI quiz item ends up `failed`, the user can manually
// supply a question/answer to finish setting it up, same as manual mode.
export async function fixFailedQuizItem(
  db: AppDb,
  quizItemId: string,
  params: { userId: string; question: string; answer: string },
) {
  const now = Math.floor(Date.now() / 1000);
  const [row] = await db
    .select({ status: quizItems.status, memoUserId: memos.userId })
    .from(quizItems)
    .innerJoin(memos, eq(memos.id, quizItems.memoId))
    .where(eq(quizItems.id, quizItemId));

  if (!row || row.memoUserId !== params.userId) {
    throw new Error("quiz item not found");
  }
  if (row.status !== "failed") {
    throw new Error("quiz item is not in failed status");
  }

  await db
    .update(quizItems)
    .set({ question: params.question, answer: params.answer, status: "ready" })
    .where(eq(quizItems.id, quizItemId));

  const reviewCardId = randomUUID();
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

  return { reviewCardId };
}
