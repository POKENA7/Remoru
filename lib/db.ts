import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { AppDb } from "../db/types";

/**
 * 応答を返したあとも続く実行に仕事を預ける関数を返す。
 *
 * design.md D1: メモの保存は生成を待たない。Workers では `waitUntil` が
 * その枠を用意する。`next dev` にはこの枠が無いので、その場で走らせる
 * （開発では応答の直後に完了するだけで、振る舞いは変わらない）。
 */
export async function getDeferrer(): Promise<(work: Promise<unknown>) => void> {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    if (typeof ctx?.waitUntil === "function") {
      return (work) => ctx.waitUntil(work);
    }
  } catch {
    // 枠が取れない環境ではその場で走らせる
  }
  return (work) => {
    void work.catch(() => {});
  };
}

/** リクエスト処理中に D1 バインディングからデータベースを取り出す。 */
export async function getDb(): Promise<AppDb> {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema }) as AppDb;
}
