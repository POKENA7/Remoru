"use client";

import { useCallback, useEffect, useState } from "react";
import { MemoTab } from "./memo-tab";
import { ReviewTab } from "./review-tab";
import type { DueItem, MemoRow } from "./types";

type Tab = "memo" | "review";

export default function Home() {
  const [tab, setTab] = useState<Tab>("memo");
  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <main className="app">
      <div className="body">
        {tab === "memo" ? (
          <MemoTab memos={memos} loading={loading} onChanged={load} />
        ) : (
          <ReviewTab
            items={due}
            loading={loading}
            onFinished={load}
            onGoToMemos={() => setTab("memo")}
          />
        )}
      </div>

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "memo"}
          onClick={() => setTab("memo")}
        >
          <i />
          メモ
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "review"}
          onClick={() => setTab("review")}
        >
          <i />
          復習
          {due.length > 0 && <span className="count">{due.length}</span>}
        </button>
      </nav>
    </main>
  );
}
