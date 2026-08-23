import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import {
  SELECTABLE_HOURS,
  getSettings,
  saveSettings,
  validateSettings,
} from "@/lib/notification-settings";

/**
 * 通知の設定を返す。
 *
 * VAPID の公開鍵を一緒に返す。購読の作成に要るが、公開鍵なので隠す必要は
 * ない。ここに載せるのは、鍵をビルド時に埋め込まずに済ませるため
 * （本番では `wrangler secret` で入れ替えられる）。
 *
 * `lastSentOn` は返さない。画面では使わない内部の記録である。
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  const settings = await getSettings(db, userId);

  return NextResponse.json({
    settings: {
      enabled: settings.enabled,
      hour: settings.hour,
      timeZone: settings.timeZone,
    },
    selectableHours: SELECTABLE_HOURS,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  });
}

/** 通知の設定を保存する。 */
export async function PUT(req: NextRequest) {
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

  const validated = validateSettings(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const db = await getDb();
  const saved = await saveSettings(db, { userId, settings: validated.settings });

  return NextResponse.json({
    settings: { enabled: saved.enabled, hour: saved.hour, timeZone: saved.timeZone },
  });
}
