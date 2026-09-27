import { createMemo, type ValidationError } from "@/features/memo/memos";
import { type Deferrer, startGeneration } from "@/features/quiz/quiz-generation-run";
import type { AppDb } from "../../db/types";
import { takeDailyUsage } from "./import-daily-usage";
import { listMemosForApi } from "./import-read";

/**
 * 取り込みAPIの要求の解釈と、登録の実行。
 *
 * **フレームワークを import しない。** `app/api` の経路は薄く保ち、
 * 判断はここに置く。ここは偽のデータベースで確かめられる（design D3）。
 */

/** 1回の要求で受け付ける件数。超えた要求は全体を拒む（spec「上限」）。 */
export const MAX_IMPORT_ITEMS = 20;

export type ImportItemResult =
  | { ok: true; memoId: string }
  | { ok: false; reason: ValidationError | "failed" };

/**
 * 応答の組み立て。
 *
 * 中身は機械が読む語だけにする。文言はCLIが持つ。
 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequestResponse(
  reason: "invalid_body" | "invalid_limit" | "invalid_tag",
): Response {
  return Response.json({ error: reason }, { status: 400 });
}

export function tooManyItemsResponse(): Response {
  return Response.json({ error: "too_many" }, { status: 400 });
}

/**
 * 1日の上限に当たったときの応答（design D6）。
 *
 * `retry-after` に翌日（UTC）までの秒数、本文に**その日の残り件数**を入れる。
 * CLI が「あと何件送れるか」と「いつ再開できるか」を示せるようにする。
 */
export function rateLimitedResponse(retryAfterSeconds: number, remaining: number): Response {
  return Response.json(
    { error: "rate_limited", remaining },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

/**
 * `Authorization` ヘッダから平文を取り出す。
 *
 * 方式の大文字小文字は問わない。解釈できないヘッダは null（呼び出し側は401）。
 */
export function parseBearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^\s*bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

export type ParsedImportBody =
  | { ok: true; contents: string[] }
  | { ok: false; reason: "invalid_body" | "too_many" };

/**
 * 要求の本文を解釈する。
 *
 * 形が違うとき（配列でない・空・文字列でない要素）は全体を拒む。中身の
 * 検証（空の本文、長すぎる本文）は件ごとに `importMemos` が返す。
 */
export function parseImportBody(raw: unknown): ParsedImportBody {
  if (!Array.isArray(raw)) return { ok: false, reason: "invalid_body" };
  if (raw.length === 0) return { ok: false, reason: "invalid_body" };
  if (raw.length > MAX_IMPORT_ITEMS) return { ok: false, reason: "too_many" };
  if (!raw.every((item) => typeof item === "string")) {
    return { ok: false, reason: "invalid_body" };
  }

  return { ok: true, contents: raw as string[] };
}

/**
 * 本文の配列をメモとして登録する。
 *
 * **1件の失敗で他を止めない**（design D5）。応答は件ごとに返す。
 * 保存は生成を待たない（`quiz-generation` spec）。
 *
 * **保存時刻は「受け付けた時刻 + 配列の中の位置（ミリ秒）」**（design D5）。
 * 同じ時刻で保存すると、一覧の順序が `id`（ランダムな UUID）の順になり、
 * 1件ずつ順に登録したときと食い違う。配列の後ろの件ほど新しくする。
 */
export async function importMemos(params: {
  db: AppDb;
  userId: string;
  contents: string[];
  now: number;
  apiKey: string | undefined | null;
  defer: Deferrer;
}): Promise<ImportItemResult[]> {
  const results: ImportItemResult[] = [];

  for (const [index, content] of params.contents.entries()) {
    // 配列の中の位置だけずらす。ずれは最大で19ミリ秒
    const now = params.now + index;
    let memoId: string;
    try {
      const created = await createMemo(params.db, {
        content,
        now,
        userId: params.userId,
      });
      if (!created.ok) {
        results.push({ ok: false, reason: created.error });
        continue;
      }
      memoId = created.memo.id;
    } catch (error) {
      // こちらから本文を記録に出さない。例外の中身までは保証しない
      console.error("取り込みの1件を保存できなかった", error);
      results.push({ ok: false, reason: "failed" });
      continue;
    }

    // **保存できた後に生成を起こす。** この時点で成功を積む——生成を
    // 起こせなかったときに失敗を返すと、CLIの再送でメモが重複する
    results.push({ ok: true, memoId });

    try {
      await startGeneration(params.db, {
        memoId,
        userId: params.userId,
        now,
        apiKey: params.apiKey,
        defer: params.defer,
      });
    } catch (error) {
      console.error("取り込みのあとの生成を起こせなかった", error);
    }
  }

  return results;
}

/**
 * `POST /api/memos` の本文を1つの応答にまとめる。
 *
 * **経路は認証とこの呼び出しだけを行う**（design D3）。ここに置くのは、
 * `app/api` が `server-only` を持つ `request-context.ts` を通すため、経路
 * そのものをテストから呼べないからである。順序（解釈 → 確保 → 保存）を
 * ここで固定し、テストで確かめる。
 *
 * 順序は design D6 のとおり。**本文の解釈のあと、保存の前**に1日の件数を
 * 確保する。検証落ちの件も確保に数える。読み取り（`GET`）はここを通らない。
 */
export async function importMemosResponse(params: {
  db: AppDb;
  userId: string;
  rawBody: unknown;
  now: number;
  apiKey: string | undefined | null;
  defer: Deferrer;
}): Promise<Response> {
  const parsed = parseImportBody(params.rawBody);
  if (!parsed.ok) {
    return parsed.reason === "too_many"
      ? tooManyItemsResponse()
      : badRequestResponse(parsed.reason);
  }

  const usage = await takeDailyUsage(params.db, {
    userId: params.userId,
    count: parsed.contents.length,
    now: params.now,
  });
  if (!usage.ok) return rateLimitedResponse(usage.retryAfterSeconds, usage.remaining);

  const results = await importMemos({
    db: params.db,
    userId: params.userId,
    contents: parsed.contents,
    now: params.now,
    apiKey: params.apiKey,
    defer: params.defer,
  });

  return Response.json({ results });
}

export type ParsedListQuery =
  | { ok: true; tagId?: string; limit?: number }
  | { ok: false; reason: "invalid_tag" | "invalid_limit" };

/** 一覧の検索条件を解釈する。空の `tag` と不正な `limit` は全体を拒む。 */
export function parseListMemosQuery(searchParams: URLSearchParams): ParsedListQuery {
  const rawTag = searchParams.get("tag");
  if (rawTag !== null && rawTag.length === 0) return { ok: false, reason: "invalid_tag" };

  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return { ok: false, reason: "invalid_limit" };
  }

  return { ok: true, tagId: rawTag ?? undefined, limit };
}

/**
 * `GET /api/memos` の応答を組み立てる。
 *
 * **読み取りは1日の件数に数えない**（design D6）。`takeDailyUsage` を呼ばない
 * ことをここで固定する。経路そのものはテストから呼べない（design D3）。
 */
export async function listMemosResponse(params: {
  db: AppDb;
  userId: string;
  searchParams: URLSearchParams;
  now: number;
}): Promise<Response> {
  const query = parseListMemosQuery(params.searchParams);
  if (!query.ok) return badRequestResponse(query.reason);

  const memos = await listMemosForApi(params.db, {
    userId: params.userId,
    tagId: query.tagId,
    limit: query.limit,
    now: params.now,
  });

  return Response.json({ memos });
}
