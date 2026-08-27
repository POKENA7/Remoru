"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MemoTab } from "./memo-tab";
import { MemoDetail } from "./memo-detail";
import { RecordTab } from "./record-tab";
import { resolveDetail } from "./detail-selection";
import { markFresh, type FreshMemo } from "./fresh-memo";
import { announcement } from "./first-run-view";
import { FirstRunNotice, type NoticeAnswer } from "./first-run-notice";
import { TagSuggestionBand } from "./tag-suggestion-band";
import { NotificationSettings } from "./notification-settings";
import { ReviewTab } from "./review-tab";
import type { DueItem, MemoRow } from "./types";

type Tab = "memo" | "review" | "record";

/** 受け取ったタグの提案。承認されるまで保持する。 */
export type SuggestionResult = {
  summary: { tag: string; count: number }[];
  assignments: { memoId: string; tag: string }[];
} | null;

/**
 * 「作成中」が残る間だけ、上限を決めて一覧を取り直す（design.md D9）。
 *
 * 生成は応答を返したあとに走るので、完了は自動では届かない。常時
 * 問い合わせると終わったあとも続くし、何もしないと書いた直後に
 * 「作成中」のまま止まって見える。
 */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 8;

export function AppShell() {
  // 通知から来たときは復習タブを開く（lib/notification-message.ts の REVIEW_URL）
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    params.get("tab") === "review" ? "review" : "memo",
  );
  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** 初回の導きを終えているか。読み込むまでは終えている扱い（first-run）。
   * 未了を既定にすると、読み込みの一瞬だけ誘いが出て消える。 */
  const [guided, setGuided] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tags, setTags] = useState<{ id: string; name: string; count: number }[]>([]);
  // 絞り込みは URL に持たない。タブと同じクライアント状態（design.md D5）
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailMemo, setDetailMemo] = useState<MemoRow | null>(null);
  /**
   * 書きかけの本文と、受け取った提案。
   *
   * **詳細を開くと MemoTab が unmount される**ので、そちらに持たせると
   * メモを1件開いただけで消える。下書きは黙って失われ、提案は取り直しに
   * モデルの呼び出し（＝課金）が要る。
   */
  const [draft, setDraft] = useState("");
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult>(null);
  /**
   * いま書いた1件。刷りの合図（design.md D2）。
   *
   * **mount を合図にしない。** 一覧は unmount されるので、戻るたびに全行が
   * 刷り直される。刷り終えたら `null` に戻す ― 残すと次の unmount でまた刷る。
   */
  const [fresh, setFresh] = useState<FreshMemo>(null);
  /** 詳細を開く前の位置と、開いた行。戻ったときに元の場所へ返す。 */
  const restore = useRef<{ scrollY: number; memoId: string } | null>(null);
  /**
   * 出している告知。**一度掴んだら離さない。**
   *
   * 見せた時点で導きを終える（`guided` が true になる）ので、そのまま
   * 計算し直すと出した瞬間に消える。
   */
  const [notice, setNotice] = useState<{
    memoId: string;
    nextReviewAt: number;
    now: number;
  } | null>(null);
  /**
   * 告知に答えたかどうか。**画面の外で持つ。**
   *
   * タブの切り替えとメモの詳細は `MemoTab` を unmount する。告知の中に
   * 持たせると、答えたのに戻ってきたとき同じ問いがもう一度出る。
   */
  const [noticeAnswer, setNoticeAnswer] = useState<NoticeAnswer>(null);
  const [suggestion, setSuggestion] = useState<{ show: boolean; untaggedCount: number }>({
    show: false,
    untaggedCount: 0,
  });

  // 刷りの合図。**同一性を保つ**（毎回作り直すと刷る効果が再実行される）
  const onSaved = useCallback((memoId: string) => setFresh(markFresh(memoId)), []);
  const onPrinted = useCallback(() => setFresh(null), []);

  const load = useCallback(async () => {
    try {
      const query = activeTagId ? `?tag=${encodeURIComponent(activeTagId)}` : "";
      const [m, d, t, s] = await Promise.all([
        fetch(`/api/memos${query}`).then((r) => r.json()),
        fetch("/api/review/due").then((r) => r.json()),
        fetch("/api/tags").then((r) => r.json()),
        fetch("/api/tags/suggestion").then((r) => r.json()),
      ]);
      setTags((t as { tags: typeof tags }).tags ?? []);
      setSuggestion(s as { show: boolean; untaggedCount: number });
      setMemos((m as { memos: MemoRow[] }).memos ?? []);
      setGuided((m as { guided?: boolean }).guided ?? true);
      setDue((d as { items: DueItem[] }).items ?? []);
    } catch {
      // 読み込みの失敗は各タブの空状態として現れる
    } finally {
      setLoading(false);
    }
  }, [activeTagId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 詳細を開く。戻り先（位置と行）を控える。 */
  const openDetail = useCallback((memo: MemoRow) => {
    restore.current = { scrollY: window.scrollY, memoId: memo.id };
    setDetailId(memo.id);
    setDetailMemo(memo);
    window.scrollTo(0, 0);
  }, []);

  /**
   * 詳細を閉じる。**閉じる経路は3つある**（戻る・下部タブ・通知のタップ）。
   * 別々に書くと、どれかに書き忘れて画面が切り替わらなくなる。
   */
  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetailMemo(null);
  }, []);


  /**
   * 詳細から戻ったとき、元の場所へ返す。
   *
   * 一覧は文書そのものがスクロールするので、詳細（短い）を開くと
   * スクロール位置が切り詰められ、戻ると先頭に飛ぶ。キーボードで
   * 辿ってきた人は焦点も失う。**探していた場所へ返すのが一覧の役目**。
   */
  useEffect(() => {
    if (detailId !== null) return;
    const saved = restore.current;
    if (!saved) return;
    restore.current = null;

    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-memo-id="${CSS.escape(saved.memoId)}"]`,
      );
      // 焦点を当てると勝手にスクロールするので、先に止めてから位置を戻す
      row?.focus({ preventScroll: true });
      window.scrollTo(0, saved.scrollY);
    });
  }, [detailId]);

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
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [generatingKey, polls, load]);

  // 通知をタップしたとき、すでに開いているものは開き直さずに切り替える
  // （spec「すでにアプリが開いているとき」）。送り手は public/sw.js。
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "remoru:open-review") return;
      setSettingsOpen(false);
      // 詳細を開いたままだと、描画の分岐が詳細を先に見るので画面が
      // 切り替わらない（spec「すでにアプリが開いているとき」）
      closeDetail();
      setTab("review");
      void load();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  const detail = resolveDetail(memos, detailId, detailMemo);
  const found = memos.find((m) => m.id === detailId) ?? null;
  if (found && found !== detailMemo) setDetailMemo(found);

  return (
    <main className="app">
      <div className="body">
        {settingsOpen ? (
          <NotificationSettings onClose={() => setSettingsOpen(false)} />
        ) : detail ? (
          <MemoDetail
            // メモが変わったら作り直す。画面が自分で持つ状態（タグ）を
            // 前のメモから引き継がせない
            key={detail.id}
            memo={detail}
            knownTags={tags}
            onChanged={load}
            onClose={closeDetail}
          />
        ) : tab === "record" ? (
          <RecordTab />
        ) : tab === "memo" ? (
          <MemoTab
            memos={memos}
            loading={loading}
            onChanged={load}
            onOpenDetail={openDetail}
            draft={draft}
            onDraftChange={setDraft}
            fresh={fresh}
            onSaved={onSaved}
            onPrinted={onPrinted}
            tags={tags}
            activeTagId={activeTagId}
            onSelectTag={setActiveTagId}
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
                  onApplied={load}
                  onDismissed={load}
                />
              ) : null
            }
          />
        ) : (
          <ReviewTab
            items={due}
            loading={loading}
            onFinished={load}
            onGoToMemos={() => setTab("memo")}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "memo"}
          onClick={() => {
            setSettingsOpen(false);
            closeDetail();
            setTab("memo");
          }}
        >
          <i />
          メモ
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "review"}
          onClick={() => {
            setSettingsOpen(false);
            closeDetail();
            setTab("review");
          }}
        >
          <i />
          復習
          {due.length > 0 && <span className="count">{due.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "record"}
          onClick={() => {
            setSettingsOpen(false);
            closeDetail();
            setTab("record");
          }}
        >
          <i />
          記録
        </button>
      </nav>
    </main>
  );
}
