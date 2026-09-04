import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { suggestionStatus } from "./tag-suggestion-run";
import { getTagsForMemos, listTagsWithCounts } from "./tags";

export const getTagsWithCounts = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await listTagsWithCounts(db, userId);
});

export const getTagsByMemo = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await getTagsForMemos(db, userId);
});

/**
 * 提案の帯を出すかどうか。
 *
 * 鍵が無い環境では提案そのものが使えないので、数えずに「出さない」を返す
 * （`tag-suggestion` spec「提案の手段が使えない環境」）。
 */
export const getSuggestionStatus = cache(async () => {
  // **認証を先に確かめる。** 鍵の有無で早く返す形にすると、環境変数次第で
  // 認証を通らない経路ができる。`query-boundary` の検査は verifySession() が
  // 書かれているかしか見ないので、順序を変えるだけで素通りしてしまう
  const userId = await verifySession();
  if (!process.env.ANTHROPIC_API_KEY) return { show: false, untaggedCount: 0 };
  const db = await getDb();
  return await suggestionStatus(db, userId);
});
