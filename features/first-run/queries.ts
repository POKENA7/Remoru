import "server-only";

import { cache } from "react";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { hasFinishedGuide } from "./first-run";

export const getGuided = cache(async () => {
  const userId = await verifySession();
  const db = await getDb();
  return await hasFinishedGuide(db, userId);
});
