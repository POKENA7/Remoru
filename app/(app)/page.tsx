import { MemoListContainer } from "./_containers/memo-list/container";

/**
 * メモの一覧。
 *
 * 未認証を止めるのは `(app)/layout.tsx`。ここでは扱わない。
 *
 * 絞り込むタグは経路が持つ（`?tag=`）。クライアント状態にすると、タブを
 * 移って戻ったときに外れる。
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  return <MemoListContainer tagId={tag ?? null} />;
}
