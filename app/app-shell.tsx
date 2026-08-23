"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MemoTab } from "./memo-tab";
import { NotificationSettings } from "./notification-settings";
import { ReviewTab } from "./review-tab";
import type { DueItem, MemoRow } from "./types";

type Tab = "memo" | "review";

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

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        fetch("/api/memos").then((r) => r.json()),
        fetch("/api/review/due").then((r) => r.json()),
      ]);
      setMemos((m as { memos: MemoRow[] }).memos ?? []);
      setDue((d as { items: DueItem[] }).items ?? []);
    } catch {
      // 読み込みの失敗は各タブの空状態として現れる
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <main className="app">
      <div className="body">
        {settingsOpen ? (
          <NotificationSettings onClose={() => setSettingsOpen(false)} />
        ) : tab === "memo" ? (
          <MemoTab memos={memos} loading={loading} onChanged={load} />
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
