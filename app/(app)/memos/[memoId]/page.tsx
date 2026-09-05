import { AppShell } from "../../../app-shell";

/**
 * メモの詳細。
 *
 * いまは一覧（`AppShell`）を出したうえで、その中で該当のメモを開かせている。
 * **タスク 3.5 でここを詳細そのものにする。** それまでは経路が存在すること
 * だけを担保する。
 */
export default async function MemoDetailPage({ params }: { params: Promise<{ memoId: string }> }) {
  const { memoId } = await params;
  return <AppShell initialTab="memo" initialDetailId={memoId} />;
}
