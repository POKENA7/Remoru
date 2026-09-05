import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getDb, getDeferrer } from "@/lib/db";
import { createMemo } from "@/features/memo/memos";
import { startGeneration } from "@/features/quiz/quiz-generation-run";

/** メモを1件保存する。 */
export async function POST(req: NextRequest) {
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

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();

  // 時計はここで読み、ドメイン層には値として渡す
  const now = Date.now();
  const result = await createMemo(db, { content, now, userId });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // 保存は生成を待たない（design.md D1）。鍵が無ければ何も起きず、
  // そのメモは未作成のまま残る。
  await startGeneration(db, {
    memoId: result.memo.id,
    userId,
    now,
    apiKey: process.env.ANTHROPIC_API_KEY,
    defer: await getDeferrer(),
  });

  return NextResponse.json({ memo: result.memo }, { status: 201 });
}
