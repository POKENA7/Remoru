import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getDb } from "@/lib/db";
import { removeTag, setTag } from "@/features/tag/tags";

/**
 * メモにタグを付ける。
 *
 * すでにタグを持つメモに別のタグを付けると差し替わる（design.md D2）。
 * 上限は lib/tags.ts の定数で決まっており、ここからは渡さない。
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

  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const result = await setTag(db, { memoId, userId, name, now: Date.now() });

  if (!result.ok) {
    // 持ち主でないメモは、存在しないものとして応答する
    const status = result.error === "memo_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ tag: { id: result.tag.id, name: result.tag.name } });
}

/** メモからタグを外す。 */
export async function DELETE(
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

  const tagId = (body as { tagId?: unknown } | null)?.tagId;
  if (typeof tagId !== "string" || tagId.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  return NextResponse.json({ removed: await removeTag(db, { memoId, userId, tagId }) });
}
