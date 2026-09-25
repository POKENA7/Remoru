import { and, desc, eq, isNull } from "drizzle-orm";
import { importRateLimits, importTokens } from "../../db/schema";
import type { AppDb } from "../../db/types";
import { MAX_TOKEN_NAME_LENGTH, type ImportTokenView, type TokenNameError } from "./types";

/**
 * 取り込みトークンのドメイン。
 *
 * **平文は保存しない。** 保存するのは SHA-256 だけである。表を読めても
 * 使えるトークンには戻せない（design D2）。
 *
 * ここは `(db, userId, …)` を受け取る純関数だけを置く。認証事業者も
 * フレームワークも import しない（design D3）。
 */

/** 平文の接頭辞。トークンらしい見た目にし、取り違えを減らす。 */
export const TOKEN_PREFIX = "rem_";

/** 乱数の長さ（バイト）。256 ビット。 */
const TOKEN_BYTES = 32;

export type ValidatedTokenName = { ok: true; name: string } | { ok: false; error: TokenNameError };

/**
 * 名前を検証し、保存に使う正規化済みの文字列を返す。
 *
 * 検証の失敗は想定された結果なので例外ではなく戻り値で表す。
 */
export function validateTokenName(raw: string): ValidatedTokenName {
  const name = raw.trim();

  if (name.length === 0) {
    return { ok: false, error: "empty_name" };
  }

  // 絵文字などのサロゲートペアを1文字として数える
  if ([...name].length > MAX_TOKEN_NAME_LENGTH) {
    return { ok: false, error: "too_long_name" };
  }

  return { ok: true, name };
}

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

function toView(row: {
  id: string;
  name: string;
  createdAt: number;
  revokedAt: number | null;
}): ImportTokenView {
  return { id: row.id, name: row.name, createdAt: row.createdAt, revokedAt: row.revokedAt };
}

export type IssueTokenResult =
  | { ok: true; token: string; view: ImportTokenView }
  | { ok: false; error: TokenNameError };

/**
 * トークンを1つ発行する。
 *
 * 返す平文を保存するのは**呼び出し側の画面だけ**であり、二度と読めない
 * （spec「トークンの平文を二度と示しては MUST NOT ならない」）。
 */
export async function issueToken(
  db: AppDb,
  params: { userId: string; name: string; now: number },
): Promise<IssueTokenResult> {
  const validated = validateTokenName(params.name);
  if (!validated.ok) return validated;

  const token = randomToken();
  const row = {
    id: crypto.randomUUID(),
    userId: params.userId,
    name: validated.name,
    tokenHash: await hashToken(token),
    createdAt: params.now,
    revokedAt: null,
  };
  await db.insert(importTokens).values(row);

  return { ok: true, token, view: toView(row) };
}

/** 利用者のトークンを新しい順に返す。**ハッシュは返さない。** */
export async function listTokens(db: AppDb, userId: string): Promise<ImportTokenView[]> {
  const rows = await db
    .select({
      id: importTokens.id,
      name: importTokens.name,
      createdAt: importTokens.createdAt,
      revokedAt: importTokens.revokedAt,
    })
    .from(importTokens)
    .where(eq(importTokens.userId, userId))
    // 同じ発行時刻のときの順序を決定的にするため id を第二キーに使う
    .orderBy(desc(importTokens.createdAt), desc(importTokens.id));

  return rows;
}

/**
 * トークンを失効する。**持ち主でなければ何もしない。**
 *
 * すでに失効済みなら true を返し、時刻は書き換えない（何度押しても同じ結果）。
 * あわせて速度の制限の数え上げを消す。失効したトークンはもう数えない。
 */
export async function revokeToken(
  db: AppDb,
  params: { userId: string; tokenId: string; now: number },
): Promise<boolean> {
  const owned = await db
    .select({ id: importTokens.id, revokedAt: importTokens.revokedAt })
    .from(importTokens)
    .where(and(eq(importTokens.id, params.tokenId), eq(importTokens.userId, params.userId)));

  if (owned.length === 0) return false;

  await db.delete(importRateLimits).where(eq(importRateLimits.tokenId, params.tokenId));
  if (owned[0].revokedAt !== null) return true;

  await db
    .update(importTokens)
    .set({ revokedAt: params.now })
    .where(eq(importTokens.id, params.tokenId));

  return true;
}

/**
 * 平文から持ち主を引く。失効済みと知らないトークンはどちらも null。
 *
 * **失効と不在を区別しない。** 呼び出し側はどちらも401にする。
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
    .where(and(eq(importTokens.tokenHash, await hashToken(token)), isNull(importTokens.revokedAt)));

  return rows[0] ?? null;
}
