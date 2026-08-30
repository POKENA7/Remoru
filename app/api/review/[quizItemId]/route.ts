import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { gradeReview } from "@/lib/review";

/**
 * 自己採点を記録する。
 *
 * `occurrenceAt` は画面が表示していた出題日。これで二重送信を弾く
 * （design.md D4）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quizItemId: string }> },
) {
  const { quizItemId } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { recalled, occurrenceAt } = (body ?? {}) as {
    recalled?: unknown;
    occurrenceAt?: unknown;
  };
  if (typeof recalled !== "boolean" || typeof occurrenceAt !== "number") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const result = await gradeReview(db, {
    quizItemId,
    recalled,
    occurrenceAt,
    now: Date.now(),
    userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    nextReviewAt: result.nextReviewAt,
    applied: result.applied,
  });
}
