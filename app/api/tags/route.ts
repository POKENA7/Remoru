import { unauthorizedResponse } from "@/features/import/import-api";
import { listTagsForApi } from "@/features/import/import-read";
import { getImportRequestContext } from "@/features/import/request-context";

/**
 * タグの一覧。CLI がメモの絞り込みと付与の前提に使う。
 *
 * 返すのはその利用者のタグだけである（spec「タグ一覧の読み取り」）。
 */
export async function GET(request: Request): Promise<Response> {
  const context = await getImportRequestContext(request);
  if (context === null) return unauthorizedResponse();

  const tags = await listTagsForApi(context.db, context.userId);
  return Response.json({ tags });
}
