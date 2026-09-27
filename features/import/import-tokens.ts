import { eq } from "drizzle-orm";
import { importTokens } from "../../db/schema";
import type { AppDb } from "../../db/types";
import type { ImportTokenView } from "./types";

/**
 * 取り込みトークンのドメイン。
 *
 * **平文は保存しない。** 保存するのは SHA-256 だけである。表を読めても
 * 使えるトークンには戻せない（design D2）。
 *
 * **有効なトークンは利用者ごとに1個。** 発行はその利用者の古い行を消して
 * から作る（再発行）。失効は行を消す。失効済みの行を残さないので、一覧に
 * 溜まることも無い。
 *
 * ここは `(db, userId, …)` を受け取る純関数だけを置く。認証事業者も
 * フレームワークも import しない（design D3）。
 */

/** 平文の接頭辞。トークンらしい見た目にし、取り違えを減らす。 */
export const TOKEN_PREFIX = "rem_";

/** 乱数の長さ（バイト）。256 ビット。 */
const TOKEN_BYTES = 32;

/** 平文を作る。 */
function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${TOKEN_PREFIX}${hex}`;
}

/** 平文の SHA-256 を16進で返す。保存と照合はこれだけを使う。 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toView(row: { id: string; createdAt: number }): ImportTokenView {
  return { id: row.id, createdAt: row.createdAt };
}

export type IssueTokenResult = { ok: true; token: string; view: ImportTokenView };

/**
 * トークンを発行する。**再発行は古い行を消してから作る**（design D2）。
 *
 * 返す平文を保存するのは**呼び出し側の画面だけ**であり、二度と読めない
 * （spec「トークンの平文を二度と示しては MUST NOT ならない」）。
 */
export async function issueToken(
  db: AppDb,
  params: { userId: string; now: number },
): Promise<IssueTokenResult> {
  const token = randomToken();
  const row = {
    id: crypto.randomUUID(),
    userId: params.userId,
    tokenHash: await hashToken(token),
    createdAt: params.now,
  };

  // 古い行を消してから作る。有効なトークンを1個に保つ
  await db.delete(importTokens).where(eq(importTokens.userId, params.userId));
  await db.insert(importTokens).values(row);

  return { ok: true, token, view: toView(row) };
}

/** 利用者のトークンを返す。無ければ null。**ハッシュは返さない。** */
export async function getTokenView(db: AppDb, userId: string): Promise<ImportTokenView | null> {
  const rows = await db
    .select({ id: importTokens.id, createdAt: importTokens.createdAt })
    .from(importTokens)
    .where(eq(importTokens.userId, userId));

  return rows[0] ?? null;
}

/**
 * 利用者のトークンを失効する（行を消す）。**持ち主でなければ何もしない。**
 *
 * 消せたら true。元から無ければ false。
 */
export async function revokeToken(db: AppDb, params: { userId: string }): Promise<boolean> {
  const rows = await db
    .delete(importTokens)
    .where(eq(importTokens.userId, params.userId))
    .returning({ id: importTokens.id });

  return rows.length > 0;
}

/**
 * 平文から持ち主を引く。知らないトークンは null。
 *
 * 行そのものを消す失効なので、失効済みを別に弾く必要は無い。呼び出し側は
 * null を401にする。
 */
export async function authenticateToken(
  db: AppDb,
  token: string,
): Promise<{ userId: string; tokenId: string } | null> {
  // 接頭辞で落としてからハッシュを計算する。無関係な入力で計算しない
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const rows = await db
    .select({ userId: importTokens.userId, tokenId: importTokens.id })
    .from(importTokens)
    .where(eq(importTokens.tokenHash, await hashToken(token)));

  return rows[0] ?? null;
}
