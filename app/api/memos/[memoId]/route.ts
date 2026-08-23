import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteMemo } from "@/lib/memos";

/** メモを削除する。問答とスケジュールは DB 側の連鎖で消える。 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memoId: string }> },
) {
  const { memoId } = await params;

  const db = await getDb();
  const result = await deleteMemo(db, { memoId });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
