import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { deleteMemo, updateMemoContent } from "@/lib/memos";

/**
 * メモの本文を書き直す。
 *
 * **問答とスケジュールには触れない**（design.md D5）。消して書き直すと
 * 連鎖で復習の進み具合まで失うので、それを避けるための経路である。
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

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const result = await updateMemoContent(db, { memoId, content, userId });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ memo: result.memo });
}

/** メモを削除する。問答とスケジュールは DB 側の連鎖で消える。 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memoId: string }> },
) {
  const { memoId } = await params;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  const result = await deleteMemo(db, { memoId, userId });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
