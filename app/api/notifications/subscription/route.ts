import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import {
  deleteSubscription,
  saveSubscription,
  validateSubscription,
} from "@/lib/notification-subscriptions";

/**
 * 端末の購読を保存する。
 *
 * 利用者はセッションから導く。要求の本文から受け取らない（change 3 D2）。
 */
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

  const subscription = validateSubscription(body);
  if (!subscription) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  await saveSubscription(db, { userId, subscription, now: Date.now() });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** 端末の購読を取り消す。自分のものでなければ何も消さない。 */
export async function DELETE(req: NextRequest) {
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

  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = await getDb();
  const removed = await deleteSubscription(db, { userId, endpoint });

  return NextResponse.json({ removed });
}
