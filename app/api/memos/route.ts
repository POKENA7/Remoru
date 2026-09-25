import {
  badRequestResponse,
  importMemos,
  parseImportBody,
  rateLimitedResponse,
  tooManyItemsResponse,
  unauthorizedResponse,
} from "@/features/import/import-api";
import { takeRateLimit } from "@/features/import/import-rate-limit";
import { listMemosForApi } from "@/features/import/import-read";
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

  const now = Date.now();

  // 費用を守るための数え上げ（design D6）。登録だけに掛ける
  const rate = await takeRateLimit(context.db, { tokenId: context.tokenId, now });
  if (!rate.ok) return rateLimitedResponse(rate.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequestResponse("invalid_body");
  }

  const parsed = parseImportBody(body);
  if (!parsed.ok) {
    return parsed.reason === "too_many"
      ? tooManyItemsResponse()
      : badRequestResponse(parsed.reason);
  }

  const results = await importMemos({
    db: context.db,
    userId: context.userId,
    contents: parsed.contents,
    now,
    apiKey: process.env.ANTHROPIC_API_KEY,
    defer: context.defer,
  });

  return Response.json({ results });
}

/** 自分のメモを新しい順に返す。`tag` と `limit` を付けられる。 */
export async function GET(request: Request): Promise<Response> {
  const context = await getImportRequestContext(request);
  if (context === null) return unauthorizedResponse();

  const params = new URL(request.url).searchParams;

  const rawTag = params.get("tag");
  if (rawTag !== null && rawTag.length === 0) return badRequestResponse("invalid_tag");
  const tagId = rawTag ?? undefined;

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return badRequestResponse("invalid_limit");
  }

  const memos = await listMemosForApi(context.db, {
    userId: context.userId,
    tagId,
    limit,
    now: Date.now(),
  });

  return Response.json({ memos });
}
