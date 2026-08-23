import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createQuizItem } from "@/lib/quiz-items";

/** メモに問と答を1つ作る。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ memoId: string }> },
) {
  const { memoId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { question, answer } = (body ?? {}) as {
    question?: unknown;
    answer?: unknown;
  };
  if (typeof question !== "string" || typeof answer !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const result = await createQuizItem(db, {
    memoId,
    question,
    answer,
    now: Date.now(),
  });

  if (!result.ok) {
    const status = result.error === "memo_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { quizItem: result.quizItem, nextReviewAt: result.nextReviewAt },
    { status: 201 },
  );
}
