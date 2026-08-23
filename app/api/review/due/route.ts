import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getDueItems } from "@/lib/review";

/** その日の出題対象を、次回出題日の古い順に返す。 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  const items = await getDueItems(db, Date.now(), userId);
  return NextResponse.json({ items });
}
