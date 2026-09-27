import {
  badRequestResponse,
  importMemosResponse,
  listMemosResponse,
  unauthorizedResponse,
} from "@/features/import/import-api";
import { getImportRequestContext } from "@/features/import/request-context";

/**
 * メモの取り込みと一覧。
 *
 * **経路は薄い。** 認証とデータベースの取り出しは
 * `features/import/request-context.ts`、判断は `features/import/import-api.ts`
 * が持つ（design D3）。ここは要求を渡し、応答を返すだけである。
 *
 * 書き込みを Server Actions に寄せてきた経緯があるが、CLI とAIには
 * ブラウザのセッションが無いため、取り込みの用途に限って経路を置く（design D3）。
 */

/** 本文の配列を複数件のメモとして登録する。単件は要素1件の配列で送る。 */
export async function POST(request: Request): Promise<Response> {
  const context = await getImportRequestContext(request);
  if (context === null) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequestResponse("invalid_body");
  }

  // 解釈・確保・保存の順序は `importMemosResponse` が持つ（design D6）
  return await importMemosResponse({
    db: context.db,
    userId: context.userId,
    rawBody: body,
    now: Date.now(),
    apiKey: process.env.ANTHROPIC_API_KEY,
    defer: context.defer,
  });
}

/** 自分のメモを新しい順に返す。`tag` と `limit` を付けられる。 */
export async function GET(request: Request): Promise<Response> {
  const context = await getImportRequestContext(request);
  if (context === null) return unauthorizedResponse();

  // 検索条件の解釈と応答の組み立ては `listMemosResponse` が持つ（design D4）
  return await listMemosResponse({
    db: context.db,
    userId: context.userId,
    searchParams: new URL(request.url).searchParams,
    now: Date.now(),
  });
}
