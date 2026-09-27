import "server-only";

import { getDb, getDeferrer } from "@/lib/db";
import { authenticateImportHeader } from "./import-auth";
import type { AppDb } from "../../db/types";

/**
 * 取り込みAPIの要求1つ分の文脈。
 *
 * **`verifySession()` は使わない。** あれはブラウザのセッションを見て、
 * 未認証をサインインへ送る（`redirect()`）。APIの要求に画面は無い。
 * Clerk も使わない（design D2）。
 *
 * **`app/api` にデータベースを触らせない**（design D3）。取り出しはここで
 * 済ませ、経路には値として渡す。`app/**` が `lib/db` を import しない
 * 規則（enforce-layer-boundaries）を、新しい経路でも守るためである。
 */

export type ImportRequestContext = {
  db: AppDb;
  userId: string;
  tokenId: string;
  /** 応答を返したあとに続く実行へ仕事を預ける関数。問答の生成が使う。 */
  defer: (work: Promise<unknown>) => void;
};

/** 認証できない要求は null。呼び出し側は401を返す。 */
export async function getImportRequestContext(
  request: Request,
): Promise<ImportRequestContext | null> {
  const db = await getDb();
  const owner = await authenticateImportHeader(request.headers.get("authorization"), db);
  if (owner === null) return null;

  return { db, userId: owner.userId, tokenId: owner.tokenId, defer: await getDeferrer() };
}
