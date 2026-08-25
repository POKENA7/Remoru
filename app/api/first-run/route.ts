import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { finishGuide } from "@/lib/first-run";

/**
 * 初回の導きを終えたものとして記録する。
 *
 * 告知を見せた時点で呼ぶ。**見送っても終わる**（design.md D5）。この場面が
 * 二度と訪れないことが、通知を繰り返し求めないことの担保になっている。
 */
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  await finishGuide(db, { userId, now: Date.now() });
  return NextResponse.json({ guided: true });
}
