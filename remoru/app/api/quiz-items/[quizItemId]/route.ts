import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../../db/schema";
import { getOrCreateUser } from "../../../../lib/users";
import { fixFailedQuizItem } from "../../../../lib/memos";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ quizItemId: string }> },
) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { quizItemId } = await params;
  const body = (await req.json()) as { question?: string; answer?: string };
  if (!body.question || !body.answer) {
    return NextResponse.json(
      { error: "question and answer are required" },
      { status: 400 },
    );
  }

  const { env } = getCloudflareContext();
  const db = drizzle(env.DB, { schema });
  const user = await getOrCreateUser(db, clerkUserId);

  try {
    const result = await fixFailedQuizItem(db, quizItemId, {
      userId: user.id,
      question: body.question,
      answer: body.answer,
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "quiz item is not in failed status" },
      { status: 409 },
    );
  }
}
