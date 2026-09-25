"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { issueToken, revokeToken } from "./import-tokens";
import type { IssueTokenActionResult, RevokeTokenActionResult } from "./types";

/**
 * 取り込みトークンの書き込みの入口。
 *
 * 形は `features/memo/actions.ts` と同じにする。**export するものは全部が
 * 公開エンドポイントになる。** ヘルパは export しない。
 */

/**
 * トークンを発行する。
 *
 * 返す平文は**この応答だけ**に載る。データベースにはハッシュしか無いので、
 * 画面を閉じたら二度と読めない（spec「発行と失効」）。
 */
export async function createImportToken(name: string): Promise<IssueTokenActionResult> {
  if (typeof name !== "string") return { ok: false, reason: "failed" };

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる（`features/memo/actions.ts` と同じ）
  const userId = await verifySession();

  try {
    const db = await getDb();
    const result = await issueToken(db, { userId, name, now: Date.now() });
    if (!result.ok) return { ok: false, reason: result.error };

    refresh();
    return { ok: true, token: result.token, view: result.view };
  } catch (error) {
    console.error("取り込みトークンを発行できなかった", error);
    return { ok: false, reason: "failed" };
  }
}

/** トークンを失効する。持ち主でないトークンは「無い」として返る。 */
export async function discardImportToken(tokenId: string): Promise<RevokeTokenActionResult> {
  if (typeof tokenId !== "string") return { ok: false, reason: "failed" };

  // 認証の失敗は `redirect()` に任せる。**try の外で呼ぶ**——
  // 中で呼ぶと `NEXT_REDIRECT` を catch が飲み込み、サインインへ飛ばずに
  // ただの失敗になる（`features/memo/actions.ts` と同じ）
  const userId = await verifySession();

  try {
    const db = await getDb();
    const revoked = await revokeToken(db, { userId, tokenId, now: Date.now() });
    if (!revoked) return { ok: false, reason: "not_found" };

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("取り込みトークンを失効できなかった", error);
    return { ok: false, reason: "failed" };
  }
}
