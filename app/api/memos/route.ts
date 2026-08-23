import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createMemo, listMemos } from "@/lib/memos";
import { getReviewStates, countUnwritten } from "@/lib/quiz-items";

/**
 * 保存済みメモを新しい順に返す。
 *
 * 各メモには復習の状態を添える。返すのは次回出題日だけで、スケジューラの
 * 内部状態は含めない（design.md D2）。
 */
export async function GET() {
  const db = await getDb();
  const [memos, states, unwritten] = await Promise.all([
    listMemos(db),
    getReviewStates(db),
    countUnwritten(db),
  ]);

  const withState = memos.map((memo) => ({
    ...memo,
    review: states.get(memo.id) ?? { kind: "unwritten" as const },
  }));

  return NextResponse.json({ memos: withState, unwrittenCount: unwritten });
}

/** メモを1件保存する。 */
export async function POST(req: NextRequest) {
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
  const result = await createMemo(db, { content, now: Date.now() });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ memo: result.memo }, { status: 201 });
}
