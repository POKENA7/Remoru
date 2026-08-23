import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createMemo, listMemos } from "@/lib/memos";

/** 保存済みメモを新しい順に返す。 */
export async function GET() {
  const db = await getDb();
  const memos = await listMemos(db);
  return NextResponse.json({ memos });
}

/** メモを1件保存する。 */
export async function POST(req: NextRequest) {
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

  // 時計はここで読み、ドメイン層には値として渡す
  const result = await createMemo(db, { content, now: Date.now() });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ memo: result.memo }, { status: 201 });
}
