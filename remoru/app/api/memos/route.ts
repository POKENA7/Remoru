import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../../db/schema";
import { getOrCreateUser } from "../../../lib/users";
import {
  createManualMemo,
  createAiMemoShell,
  generateQuizWithRetry,
  completeAiQuizItem,
} from "../../../lib/memos";

export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    content?: string;
    quizMode?: "ai" | "manual";
    question?: string;
    answer?: string;
  };

  if (!body.content || (body.quizMode !== "ai" && body.quizMode !== "manual")) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { env, ctx } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);

  if (body.quizMode === "manual") {
    if (!body.question || !body.answer) {
      return NextResponse.json(
        { error: "question and answer are required for manual mode" },
        { status: 400 },
      );
    }
    const result = await createManualMemo(db, {
      userId: user.id,
      content: body.content,
      question: body.question,
      answer: body.answer,
    });
    return NextResponse.json(result, { status: 201 });
  }

  const shell = await createAiMemoShell(db, {
    userId: user.id,
    content: body.content,
  });

  ctx.waitUntil(
    generateQuizWithRetry(env.AI, body.content)
      .then((qa) =>
        completeAiQuizItem(db, shell.quizItemId, { userId: user.id }, qa),
      )
      .catch(() =>
        completeAiQuizItem(db, shell.quizItemId, { userId: user.id }, null),
      ),
  );

  return NextResponse.json(shell, { status: 201 });
}

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);
  const rows = await db
    .select({
      id: schema.memos.id,
      content: schema.memos.content,
      quizMode: schema.memos.quizMode,
      createdAt: schema.memos.createdAt,
      quizItemId: schema.quizItems.id,
      quizStatus: schema.quizItems.status,
      question: schema.quizItems.question,
      answer: schema.quizItems.answer,
    })
    .from(schema.memos)
    .innerJoin(schema.quizItems, eq(schema.quizItems.memoId, schema.memos.id))
    .where(eq(schema.memos.userId, user.id));

  return NextResponse.json(rows);
}
