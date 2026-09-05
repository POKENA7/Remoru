import { getGuided } from "@/features/first-run/queries";
import { MemoScreen } from "@/features/memo/components/memo-screen";
import { getMemos } from "@/features/memo/queries";
import type { MemoRow } from "@/features/memo/types";
import { getMemoReviewStates } from "@/features/quiz/queries";
import { getSuggestionStatus, getTagsByMemo, getTagsWithCounts } from "@/features/tag/queries";

/**
 * メモの一覧に要るものを集める。
 *
 * design.md D2: **Container は「この経路に何を並べるか」を持つ。** 取得だけを
 * 行い、表示は `features/memo/components/` に渡す。
 *
 * 6 本の取得に依存関係が無いので並行に走らせる（『Next.jsの考え方』第6章）。
 * `queries.ts` は `cache()` で包まれているので、他の Container が同じものを
 * 求めても 1 リクエストに 1 回しか問い合わせない。
 */
export async function MemoListContainer({ tagId }: { tagId: string | null }) {
  try {
    return await render(tagId);
  } catch (error) {
    // 移す前の `fetch` も失敗を捕まえ、空の一覧として現していた。
    // **これは途中の形である**——`error.tsx` を置いたら任せる（次の change）
    console.error("メモの一覧を読めなかった", error);
    return (
      <MemoScreen
        memos={[]}
        tags={[]}
        suggestion={{ show: false, untaggedCount: 0 }}
        guided={true}
        activeTagId={tagId}
      />
    );
  }
}

async function render(tagId: string | null) {
  const [memos, states, tagsByMemo, tags, suggestion, guided] = await Promise.all([
    getMemos(tagId ?? undefined),
    getMemoReviewStates(),
    getTagsByMemo(),
    getTagsWithCounts(),
    getSuggestionStatus(),
    getGuided(),
  ]);

  const rows: MemoRow[] = memos.map((memo) => ({
    ...memo,
    review: states.get(memo.id) ?? { kind: "unwritten" as const },
    tags: (tagsByMemo.get(memo.id) ?? []).map((t) => ({ id: t.id, name: t.name })),
  }));

  return (
    <MemoScreen
      memos={rows}
      tags={tags}
      suggestion={suggestion}
      guided={guided}
      activeTagId={tagId}
    />
  );
}
