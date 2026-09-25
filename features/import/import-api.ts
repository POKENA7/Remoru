import { type ValidationError, createMemo } from "@/features/memo/memos";
import { type Deferrer, startGeneration } from "@/features/quiz/quiz-generation-run";
import type { AppDb } from "../../db/types";

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

export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate_limited" },
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

  for (const content of params.contents) {
    let memoId: string;
    try {
      const created = await createMemo(params.db, {
        content,
        now: params.now,
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
        now: params.now,
        apiKey: params.apiKey,
        defer: params.defer,
      });
    } catch (error) {
      console.error("取り込みのあとの生成を起こせなかった", error);
    }
  }

  return results;
}
