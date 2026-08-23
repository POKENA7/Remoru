import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getDueItems } from "@/lib/review";

/** その日の出題対象を、次回出題日の古い順に返す。 */
export async function GET() {
  const db = await getDb();
  const items = await getDueItems(db, Date.now());
  return NextResponse.json({ items });
}
