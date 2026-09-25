import type { AppDb } from "../../db/types";
import { parseBearer } from "./import-api";
import { authenticateToken } from "./import-tokens";

/**
 * 取り込みの認証。**要求の解釈と表の照合をつなぐだけ**の層。
 *
 * `request-context.ts` から切り離してあるのは、フレームワーク（`server-only`
 * と `getCloudflareContext`）を通さずに確かめられるようにするためである
 * （design D3）。
 */

export type ImportOwner = { userId: string; tokenId: string };

/**
 * `Authorization` ヘッダから持ち主を引く。
 *
 * 解釈できないヘッダ、知らないトークン、失効したトークンはどれも null。
 * 呼び出し側は401にする。
 */
export async function authenticateImportHeader(
  header: string | null,
  db: AppDb,
): Promise<ImportOwner | null> {
  const token = parseBearer(header);
  if (token === null) return null;

  return await authenticateToken(db, token);
}
