import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getDb } from "@/lib/db";
import { retentionLayers, totalRecalled } from "@/features/record/learning-record";

/** おぼえてきたこと。累計と、いま持っているものの層。 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  const [recalled, layers] = await Promise.all([
    totalRecalled(db, userId),
    retentionLayers(db, userId),
  ]);

  return NextResponse.json({ recalled, layers });
}
