import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { listTagsWithCounts } from "@/lib/tags";

/** 絞り込みに出すタグの一覧。名前と、そのタグを持つ自分のメモの件数。 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  return NextResponse.json({ tags: await listTagsWithCounts(db, userId) });
}
