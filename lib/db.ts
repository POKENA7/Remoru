import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { AppDb } from "../db/types";

/** リクエスト処理中に D1 バインディングからデータベースを取り出す。 */
export async function getDb(): Promise<AppDb> {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema }) as AppDb;
}
