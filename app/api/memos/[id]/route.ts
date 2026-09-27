import { getMemoForApi } from "@/features/import/import-read";
import { unauthorizedResponse } from "@/features/import/import-api";
import { getImportRequestContext } from "@/features/import/request-context";

/**
 * メモ1件の詳細。本文とタグと問答と次回出題日を返す。
 *
 * 他人のメモと存在しないメモは**同じ応答**にする（spec「他人のメモの詳細は
 * 無いものとして応答する」）。id の総当たりで有無を確かめられないようにする。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const context = await getImportRequestContext(request);
  if (context === null) return unauthorizedResponse();

  const { id } = await params;
  const memo = await getMemoForApi(context.db, {
    userId: context.userId,
    memoId: id,
    now: Date.now(),
  });

  if (memo === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({ memo });
}
