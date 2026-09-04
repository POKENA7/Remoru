import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { retentionLayers, totalRecalled } from "./learning-record";

/**
 * おぼえてきたこと。上（累計）と下（層）は性格が逆だが、同時に読む
 * （design-decisions「上と下で性格が逆」）。依存が無いので並行に取る。
 */
export const getLearningRecord = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  const [recalled, layers] = await Promise.all([
    totalRecalled(db, userId),
    retentionLayers(db, userId),
  ]);
  return { recalled, layers };
});
