import { notFound } from "next/navigation";
import { MemoDetailScreen } from "@/features/memo/components/memo-detail-screen";
import { getMemoById } from "@/features/memo/queries";
import type { MemoRow } from "@/features/memo/types";
import { getMemoReviewStates } from "@/features/quiz/queries";
import { getTagsByMemo, getTagsWithCounts } from "@/features/tag/queries";

/**
 * メモ1件の詳細。
 *
 * **一覧を経由しない。** 経路から来た id で直接引くので、絞り込みの状態や
 * 一覧に載っているかどうかに左右されない。以前はクライアント状態で
 * 一覧から探しており、絞り込み中にタグを外すと画面が無言で閉じていた
 * （`resolveDetail` が要る形だった）。経路にすることでその問題自体が消える。
 *
 * 他人のメモと消えたメモは、どちらも `notFound()`。区別すると、id の
 * 総当たりで存在だけが分かってしまう（navigation spec）。
 */
export async function MemoDetailContainer({ memoId }: { memoId: string }) {
  const memo = await getMemoById(memoId);
  if (!memo) notFound();

  const [states, tagsByMemo, tags] = await Promise.all([
    getMemoReviewStates(),
    getTagsByMemo(),
    getTagsWithCounts(),
  ]);

  const row: MemoRow = {
    ...memo,
    review: states.get(memo.id) ?? { kind: "unwritten" as const },
    tags: (tagsByMemo.get(memo.id) ?? []).map((t) => ({ id: t.id, name: t.name })),
  };

  return <MemoDetailScreen memo={row} knownTags={tags} />;
}
