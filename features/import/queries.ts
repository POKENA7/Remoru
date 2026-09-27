import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { getTokenView } from "./import-tokens";

/**
 * 設定の画面に渡すトークン。**利用者ごとに1個なので有無だけ。**
 *
 * 通知の設定と同じく、**開くときに取りに行かない**（design D10）。メモの
 * 一覧の描画で読み、シートへ渡す。`cache()` は同じ要求の中の重複をまとめる。
 */
export const getImportToken = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await getTokenView(db, userId);
});
