import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { requestNow } from "@/lib/request-clock";
import { verifySession } from "@/lib/session";
import { getDueItems } from "./review";

/** 「いま」はリクエストに 1 つ（`lib/request-clock.ts`）。 */
export const getDue = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await getDueItems(db, requestNow(), userId);
});
