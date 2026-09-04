import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { listMemos } from "./memos";

/**
 * Server Components 向けの入口。
 *
 * design.md D8: **ドメイン関数は純粋なままにする。** 認証と D1 の取り出しは
 * この層が引き受け、`./memos` には値として渡す。ドメイン関数が
 * `(db, userId, …)` を受け取る形は、テストが偽の db で回るための条件であり、
 * `auth-boundary` の検査が固定している境界でもある。
 *
 * `cache()` はリクエスト内のメモ化。Container を分けると同じ取得が複数回
 * 走りうるので、ここで一度にまとめる。
 */
export const getMemos = cache(async (tagId?: string) => {
  const userId = await verifySession();
  const db = await getDb();
  return await listMemos(db, userId, tagId);
});
