import { getGuided } from "@/features/first-run/queries";
import { getImportToken } from "@/features/import/queries";
import type { ImportTokenState } from "@/features/import/types";
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
        vapidPublicKey={null}
        importToken={{ status: "error" }}
      />
    );
  }
}

async function render(tagId: string | null) {
  const [memos, states, tagsByMemo, tags, suggestion, guided, importToken] = await Promise.all([
    getMemos(tagId ?? undefined),
    getMemoReviewStates(),
    getTagsByMemo(),
    getTagsWithCounts(),
    getSuggestionStatus(),
    getGuided(),
    /*
     * **トークンが読めなくても一覧は出す。** ここで投げると、関係のない
     * メモの一覧まで空の画面に落ちる。
     *
     * **失敗を `null` に潰さない。** `null` は「トークンが無い」と同じ値で、
     * シートが発行の操作を出してしまう。発行は古い行を消してから作るので
     * （design D2）、読めなかっただけの利用者の有効なトークンを消させる。
     * 「読めなかった」は別の値で渡し、シートに操作を出させない。
     */
    getImportToken()
      .then((token): ImportTokenState => ({ status: "ok", token }))
      .catch((error): ImportTokenState => {
        console.error("取り込みトークンを読めなかった", error);
        return { status: "error" };
      }),
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
      /*
       * 初回の告知が通知を差し出せるかの判断に要る（design.md D8）。
       * 公開鍵なので隠す必要はなく、ビルド時に埋め込まないために
       * `process.env` から読む（本番では `wrangler secret` で入れ替える）。
       */
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
      importToken={importToken}
    />
  );
}
