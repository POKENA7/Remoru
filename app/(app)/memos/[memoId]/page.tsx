import { MemoDetailContainer } from "../../_containers/memo-detail/container";

/** メモの詳細。未認証を止めるのは `(app)/layout.tsx`。 */
export default async function MemoDetailPage({ params }: { params: Promise<{ memoId: string }> }) {
  const { memoId } = await params;
  return <MemoDetailContainer memoId={memoId} />;
}
