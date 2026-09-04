import { auth } from "@clerk/nextjs/server";

/**
 * 進行中のセッションから利用者を識別する。
 *
 * design.md D1: **Clerk を知るのはこのファイルだけ。** ドメイン層
 * （lib/memos.ts / lib/quiz-items.ts / lib/review.ts）は認証事業者を知らない。
 *
 * design.md D2: 利用者の識別子を要求の本文・問い合わせ文字列・経路から
 * 受け取らない。値を渡せる構造にすると、差し替えるだけで他人のデータに
 * 到達できてしまう。識別は常にここでセッションから導出する。
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
