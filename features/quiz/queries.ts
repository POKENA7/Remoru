import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { requestNow } from "@/lib/request-clock";
import { verifySession } from "@/lib/session";
import { countUnwritten, getReviewStates } from "./quiz-items";

/**
 * 時計はこの層で読む。ドメイン層には値として渡す（既存の慣習）。
 *
 * **`Date.now()` を直に呼ばない。** 取得関数ごとに読むと、同じ画面の中で
 * 違う時刻を見ることになり、日境界をまたいだときに判定がずれる。
 * リクエストに 1 つの「いま」を `requestNow()` から取る。
 */
export const getMemoReviewStates = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await getReviewStates(db, userId, requestNow());
});

export const getUnwrittenCount = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await countUnwritten(db, userId, requestNow());
});
