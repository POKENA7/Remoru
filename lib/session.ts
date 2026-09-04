import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * 進行中のセッションから利用者を識別する。
 *
 * design.md D1: **Clerk を知るのはこのファイルだけ。** ドメイン層
 * （features/memo/memos.ts / features/quiz/quiz-items.ts /
 * features/review/review.ts）は認証事業者を知らない。
 *
 * design.md D2: 利用者の識別子を要求の本文・問い合わせ文字列・経路から
 * 受け取らない。値を渡せる構造にすると、差し替えるだけで他人のデータに
 * 到達できてしまう。識別は常にここでセッションから導出する。
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * 認証を確かめ、利用者の識別子を返す。**無ければ止める。**
 *
 * server-side-reads D8: 認可はデータフェッチ層に置く。各 feature の
 * `queries.ts` がこれを呼ぶので、画面側で呼び忘れても**データが出ない側に倒れる**。
 *
 * API ルートではこれを使わない。`redirect()` は画面のための応答であり、
 * ルートは `getCurrentUserId()` を見て 401 を返す。
 */
export async function verifySession(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  return userId;
}
