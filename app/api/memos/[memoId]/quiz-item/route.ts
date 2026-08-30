import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { createQuizItem, getQuizItem, replaceQuizText } from "@/lib/quiz-items";

/**
 * そのメモの問と答を返す。
 *
 * **一覧の応答には載せない。** 答えを見せるのは詳細だけで、一覧の payload に
 * 入れるとメモの数だけ答えを運ぶことになる。詳細を開いたときに1件だけ引く。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ memoId: string }> }) {
  const { memoId } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  const quizItem = await getQuizItem(db, { memoId, userId });
  if (!quizItem) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ quizItem });
}

/** メモに問と答を1つ作る。 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ memoId: string }> }) {
  const { memoId } = await params;

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
    userId,
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

/**
 * 問と答を書き直す。**受け取った内容で置き換えるだけ**で、モデルは呼ばない
 * （design.md D5）。
 *
 * 生成は最初の1回だけを担い、外したときは人の手で直す。もう一度振っても
 * 同じ結果になることがあり、費用もかかる。
 *
 * `replaceQuizText` は **review_schedules に触れない**。触らないことが、
 * 復習の進み具合を保つことの実装そのものになっている（spec の要件）。
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ memoId: string }> }) {
  const { memoId } = await params;

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

  const { question, answer } = (body ?? {}) as {
    question?: unknown;
    answer?: unknown;
  };
  if (typeof question !== "string" || typeof answer !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const result = await replaceQuizText(db, { memoId, question, answer, userId });

  if (!result.ok) {
    // 持ち主でないメモは、存在しないものとして応答する
    const status = result.error === "memo_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  // 答えも返す。詳細画面が答えを示すようになったため（design.md D1）
  return NextResponse.json({
    quizItem: { question: result.quizItem.question, answer: result.quizItem.answer },
    nextReviewAt: result.nextReviewAt,
  });
}
