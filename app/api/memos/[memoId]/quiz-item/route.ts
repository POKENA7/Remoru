import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { createQuizItem, getQuizItem } from "@/lib/quiz-items";
import { finishGeneration } from "@/lib/quiz-generation-run";

/** メモに問と答を1つ作る。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ memoId: string }> },
) {
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
 * 問と答を作り直す。
 *
 * 保存時の生成と違い、こちらは**待たせる**。利用者が押して結果を待って
 * いる操作なので、応答後の枠に預けると何も起きていないように見える。
 * 一覧は問答があれば「作成済み」を出すため、作り直しの最中を表す状態も無い。
 */
export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ memoId: string }> },
) {
  const { memoId } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();

  let result;
  try {
    result = await finishGeneration(db, {
      memoId,
      userId,
      now: Date.now(),
      apiKey: process.env.ANTHROPIC_API_KEY,
      // 押されたときだけ、いまの問答を置き換える
      replaceExisting: true,
    });
  } catch (error) {
    // 保存経路と同じく静かに失敗させる（design.md D6）。以前の問答は残る。
    console.error("作り直しが異常終了した", error);
    return NextResponse.json({ error: "request_failed" }, { status: 502 });
  }

  if (!result.ok) {
    // 持ち主でないメモは、存在しないものとして応答する
    const status = result.reason === "memo_not_found" ? 404 : 502;
    return NextResponse.json({ error: result.reason }, { status });
  }

  // 問だけを返す。**答えは返さない。** クライアントは使っておらず、
  // 渡せば一覧と同じく想起の機会を削る側に置くことになる。
  const quizItem = await getQuizItem(db, { memoId, userId });
  return NextResponse.json({ question: quizItem?.question ?? null });
}
