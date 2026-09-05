import { AppShell } from "../app-shell";

/**
 * メモの一覧。
 *
 * 未認証を止めるのは `(app)/layout.tsx`。ここでは扱わない。
 *
 * 絞り込むタグは経路が持つ（`?tag=`）。クライアント状態にすると、タブを
 * 移って戻ったときに外れる。
 *
 * 中身はまだ `AppShell`（クライアント）のまま。タスク 3.1 で Container に
 * 組み替える。
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  return <AppShell initialTab="memo" tagId={tag ?? null} />;
}
