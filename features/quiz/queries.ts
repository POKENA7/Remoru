import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { requestNow } from "@/lib/request-clock";
import { verifySession } from "@/lib/session";
import { countUnwritten, getQuizItem, getReviewStates } from "./quiz-items";

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

/**
 * そのメモの問と答。**詳細を開いたときに1件だけ引く。**
 *
 * 一覧の取得には載せない。載せるとメモの数だけ答えを運ぶことになる
 * （`getReviewStates` が問だけを返しているのはそのため）。
 *
 * design.md D7: 以前は詳細を開いてから `useEffect` で追いかけて取っていた。
 * 答えの行と鉛筆のボタンが一拍遅れて現れるので、サーバーで読む側へ移した。
 */
export const getQuizDetail = cache(async (memoId: string) => {
  const userId = await verifySession();
  const db = await getDb();
  return await getQuizItem(db, { memoId, userId });
});
