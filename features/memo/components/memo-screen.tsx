"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FirstRunNotice,
  type NoticeAnswer,
} from "@/features/first-run/components/first-run-notice";
import { announcement } from "@/features/first-run/first-run-view";
import { TagSuggestionBand } from "@/features/tag/components/tag-suggestion-band";
import type { SuggestionResult } from "@/features/tag/types";
import { useSessionState } from "@/hooks/use-session-state";
import { resolveDetail } from "../detail-selection";
import { type FreshMemo, markFresh } from "../fresh-memo";
import type { MemoRow } from "../types";
import { MemoDetail } from "./memo-detail";
import { MemoTab } from "./memo-tab";

/**
 * メモの一覧の画面。**取得はしない**——渡されたものを表示し、
 * 利用者の操作に応じた状態だけを持つ（design.md D2）。
 *
 * データは `app/(app)/_containers/memo-list/` が Server Components で取り、
 * 書き込みのあとは `router.refresh()` でサーバーの描画ごと取り直す。
 * 次の change で Server Actions にしたとき、これは `revalidatePath()` に
 * 置き換わる。**つまり `router.refresh()` は途中の形である**（design.md D9）。
 */

/**
 * 「作成中」が残る間だけ、上限を決めて取り直す（design.md D9）。
 *
 * 生成は応答を返したあとに走るので、完了は自動では届かない。常時
 * 問い合わせると終わったあとも続くし、何もしないと書いた直後に
 * 「作成中」のまま止まって見える。
 */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 8;

export function MemoScreen({
  memos,
  tags,
  suggestion,
  guided,
  activeTagId,
}: {
  memos: MemoRow[];
  tags: { id: string; name: string; count: number }[];
  suggestion: { show: boolean; untaggedCount: number };
  /** 初回の導きを終えているか。誘いと告知の出し分けに要る（first-run） */
  guided: boolean;
  /** 絞り込むタグ。経路が持つ（`/?tag=`） */
  activeTagId: string | null;
}) {
  const router = useRouter();

  /**
   * 書きかけの本文と、受け取った提案。
   *
   * **経路をまたいでも残す**（server-side-reads D3 / D4）。タブは `<Link>` なので、
   * 移るたびにこの画面は unmount される。下書きは黙って失われ、提案は取り直しに
   * モデルの呼び出し（＝課金）が要る。
   */
  const [draft, setDraft] = useSessionState("remoru:draft", "");
  const [suggestionResult, setSuggestionResult] = useSessionState<SuggestionResult>(
    "remoru:tag-suggestion",
    null,
  );

  /**
   * いま書いた1件。刷りの合図（design.md D2）。
   *
   * **mount を合図にしない。** 一覧は unmount されるので、戻るたびに全行が
   * 刷り直される。刷り終えたら `null` に戻す ― 残すと次の unmount でまた刷る。
   */
  const [fresh, setFresh] = useState<FreshMemo>(null);
  const onSaved = useCallback((memoId: string) => setFresh(markFresh(memoId)), []);
  const onPrinted = useCallback(() => setFresh(null), []);

  /**
   * 出している告知と、それに答えたか。
   *
   * 見せた時点で導きを終える（サーバーに記録する）ので、そのまま計算し直すと
   * 出した瞬間に消える。一度掴んだら離さない。
   */
  const [notice, setNotice] = useState<{
    memoId: string;
    nextReviewAt: number;
    now: number;
  } | null>(null);
  const [noticeAnswer, setNoticeAnswer] = useState<NoticeAnswer>(null);

  /**
   * 詳細。**タスク 3.5 で経路に移す**（いまはクライアント状態）。
   *
   * 最後に見えていたメモを控える。絞り込み中に詳細でタグを外すと、
   * 取り直した一覧からそのメモが消え、**画面が無言で一覧へ戻る**
   * （change 6 のレビューで一度直した症状）。`resolveDetail` がこれを防ぐ。
   */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lastSeenDetail, setLastSeenDetail] = useState<MemoRow | null>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  const onSelectTag = useCallback(
    (next: string | null) => {
      router.replace(next ? `/?tag=${encodeURIComponent(next)}` : "/");
    },
    [router],
  );

  /**
   * 初めて問答ができたら告知を出し、その時点で導きを終える。
   *
   * 見送っても終える（design.md D5）。この場面が二度と訪れないことが、
   * 通知を繰り返し求めないことの担保になっている。
   */
  useEffect(() => {
    if (notice) return;
    const next = announcement({ guided, memos, now: Date.now() });
    if (!next) return;
    setNotice(next);
    // 記録に失敗しても告知は出したままにする。次に開いたときにまた出るが、
    // 一度も見せないよりよい
    void fetch("/api/first-run", { method: "POST" }).catch(() => {});
  }, [guided, memos, notice]);

  // 生成中のメモの並び。変わったら数え直す（新しく書いたときなど）
  const generatingKey = useMemo(
    () =>
      memos
        .filter((m) => m.review.kind === "generating")
        .map((m) => m.id)
        .sort()
        .join(","),
    [memos],
  );
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    setPolls(0);
  }, [generatingKey]);

  useEffect(() => {
    if (generatingKey === "" || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [generatingKey, polls, router]);

  const detail = resolveDetail(memos, detailId, lastSeenDetail);
  // 一覧に居る間は最新のものを控え続ける。消えたときの拠り所になる
  const found = memos.find((m) => m.id === detailId) ?? null;
  if (found && found !== lastSeenDetail) setLastSeenDetail(found);

  if (detail) {
    return (
      <MemoDetail
        // メモが変わったら作り直す。画面が自分で持つ状態（タグ）を
        // 前のメモから引き継がせない
        key={detail.id}
        memo={detail}
        knownTags={tags}
        onChanged={refresh}
        onClose={() => {
          setDetailId(null);
          setLastSeenDetail(null);
        }}
      />
    );
  }

  return (
    <MemoTab
      memos={memos}
      loading={false}
      onChanged={refresh}
      onOpenDetail={(memo) => {
        setDetailId(memo.id);
        setLastSeenDetail(memo);
      }}
      draft={draft}
      onDraftChange={setDraft}
      fresh={fresh}
      onSaved={onSaved}
      onPrinted={onPrinted}
      tags={tags}
      activeTagId={activeTagId}
      onSelectTag={onSelectTag}
      announcement={
        notice
          ? {
              memoId: notice.memoId,
              node: (
                <FirstRunNotice
                  nextReviewAt={notice.nextReviewAt}
                  now={notice.now}
                  answer={noticeAnswer}
                  onAnswer={setNoticeAnswer}
                />
              ),
            }
          : null
      }
      suggestion={
        suggestion.show ? (
          <TagSuggestionBand
            untaggedCount={suggestion.untaggedCount}
            result={suggestionResult}
            onResult={setSuggestionResult}
            onApplied={refresh}
            onDismissed={refresh}
          />
        ) : null
      }
    />
  );
}
