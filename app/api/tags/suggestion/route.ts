import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  applyAssignments,
  dismissSuggestion,
  proposeTags,
  suggestionStatus,
} from "@/features/tag/tag-suggestion-run";

/**
 * 提案の帯を出すかどうか。
 *
 * 鍵が無い環境では提案そのものを示さない（design.md D11）。
 */
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();

  // 帯が出ていない状態では呼ばせない。呼び出し1回がそのまま課金になる
  // ので、契機の判断を画面側だけに置かない。
  const status = await suggestionStatus(db, userId);
  if (!status.show) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }

  let result;
  try {
    result = await proposeTags(db, { userId, apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (error) {
    console.error("タグの提案が異常終了した", error);
    return NextResponse.json({ error: "request_failed" }, { status: 502 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  // 承認に出すのはタグ名と件数だけ。どのメモに何が付くかは返すが、
  // 画面には出さない（受け入れのときにそのまま送り返してもらう）。
  return NextResponse.json({ summary: result.summary, assignments: result.assignments });
}

/** 提案を受け入れる。 */
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

  const raw = (body as { assignments?: unknown } | null)?.assignments;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // 要求から来た値なので、形だけを確かめて渡す。持ち主の確認と
  // 1メモ1タグの規則は applyAssignments の先（setTag）が担う。
  const assignments = raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { memoId, tag } = item as Record<string, unknown>;
    if (typeof memoId !== "string" || typeof tag !== "string") return [];
    return [{ memoId, tag }];
  });

  const db = await getDb();
  const result = await applyAssignments(db, { userId, assignments, now: Date.now() });

  return NextResponse.json(result);
}

/** 提案を断る。次にたまるまで出さない。 */
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getDb();
  await dismissSuggestion(db, { userId, now: Date.now() });
  return NextResponse.json({ dismissed: true });
}
