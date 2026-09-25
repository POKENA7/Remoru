import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { listTokens } from "./import-tokens";

/**
 * 設定のシートに渡すトークンの一覧。
 *
 * 通知の設定と同じく、**開くときに取りに行かない**（design D10）。メモの
 * 一覧の描画で読み、シートへ渡す。`cache()` は同じ要求の中の重複をまとめる。
 */
export const getImportTokens = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await listTokens(db, userId);
});
