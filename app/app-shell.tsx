"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MemoTab } from "./memo-tab";
import { MemoSheet } from "./memo-sheet";
import { TagSuggestionBand } from "./tag-suggestion-band";
import { NotificationSettings } from "./notification-settings";
import { ReviewTab } from "./review-tab";
import type { DueItem, MemoRow } from "./types";

type Tab = "memo" | "review";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tags, setTags] = useState<{ id: string; name: string; count: number }[]>([]);
  // 絞り込みは URL に持たない。タブと同じクライアント状態（design.md D5）
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ show: boolean; untaggedCount: number }>({
    show: false,
    untaggedCount: 0,
  });

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
      setTab("review");
      void load();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  const detail = memos.find((m) => m.id === detailId) ?? null;

  return (
    <main className="app">
      <div className="body">
        {settingsOpen ? (
          <NotificationSettings onClose={() => setSettingsOpen(false)} />
        ) : tab === "memo" ? (
          <MemoTab
            memos={memos}
            loading={loading}
            onChanged={load}
            onOpenDetail={(memo) => setDetailId(memo.id)}
            tags={tags}
            activeTagId={activeTagId}
            onSelectTag={setActiveTagId}
            suggestion={
              suggestion.show ? (
                <TagSuggestionBand
                  untaggedCount={suggestion.untaggedCount}
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

      {detail && (
        <MemoSheet
          memo={detail}
          knownTags={tags}
          onChanged={load}
          onClose={() => setDetailId(null)}
        />
      )}

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "memo"}
          onClick={() => {
            setSettingsOpen(false);
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
            setTab("review");
          }}
        >
          <i />
          復習
          {due.length > 0 && <span className="count">{due.length}</span>}
        </button>
      </nav>
    </main>
  );
}
