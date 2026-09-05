import { redirect } from "next/navigation";

/**
 * メモの詳細。
 *
 * **まだ経路として実装していない**（タスク 3.5）。いまは一覧へ送る。
 * 一覧の中で詳細を開く形は残っているので、利用者の導線は切れない。
 */
export default async function MemoDetailPage() {
  redirect("/");
}
