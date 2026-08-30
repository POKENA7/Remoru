import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb, getDeferrer } from "@/lib/db";
import { hasFinishedGuide } from "@/lib/first-run";
import { createMemo, listMemos } from "@/lib/memos";
import { startGeneration } from "@/lib/quiz-generation-run";
import { countUnwritten, getReviewStates } from "@/lib/quiz-items";
import { getTagsForMemos } from "@/lib/tags";

/**
 * 保存済みメモを新しい順に返す。
 *
 * 各メモには復習の状態を添える。返すのは次回出題日だけで、スケジューラの
 * 内部状態は含めない（design.md D2）。
 */
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 絞り込むタグ。指定が無ければ全件（design.md D5）
  const tagId = req.nextUrl.searchParams.get("tag") ?? undefined;

  const db = await getDb();
  const now = Date.now();
  const [memos, states, unwritten, tagsByMemo, guided] = await Promise.all([
    listMemos(db, userId, tagId),
    getReviewStates(db, userId, now),
    countUnwritten(db, userId, now),
    getTagsForMemos(db, userId),
    // 初回の導きを終えているか。誘いと告知の出し分けに要る（first-run）
    hasFinishedGuide(db, userId),
  ]);

  const withState = memos.map((memo) => ({
    ...memo,
    review: states.get(memo.id) ?? { kind: "unwritten" as const },
    tags: (tagsByMemo.get(memo.id) ?? []).map((t) => ({ id: t.id, name: t.name })),
  }));

  return NextResponse.json({ memos: withState, unwrittenCount: unwritten, guided });
}

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
