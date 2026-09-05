"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotificationSettings } from "@/features/notification/components/notification-settings";
import { RecordTab } from "@/features/record/components/record-tab";
import { ReviewTab } from "@/features/review/components/review-tab";
import type { DueItem } from "@/features/review/types";

/**
 * 復習と記録の画面。
 *
 * **メモの一覧はここにいない**——`app/(app)/page.tsx` が Server Components で
 * 取り、`features/memo/components/memo-screen.tsx` が表示する。
 * ここも同じ形へ移す途中である（server-side-reads タスク 3.6 / 3.7）。
 * それが済めばこのファイルは消える（同 4.2）。
 */
export function AppShell({ initialTab }: { initialTab: "review" | "record" }) {
  const router = useRouter();
  const [due, setDue] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/review/due").then((r) => r.json());
      setDue((d as { items: DueItem[] }).items ?? []);
    } catch {
      // 読み込みの失敗は空状態として現れる
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * サーバー側が持っている表示を取り直す。
   *
   * 下部タブの復習バッジは `(app)/layout.tsx` が描いており、クライアントの
   * `due` を更新しても変わらない。**採点したのに件数が減らない**ので、
   * サーバーの描画ごと更新する。
   *
   * タスク 4.1 で書き込み全体をこの形に揃え、次の change で Server Actions に
   * したときに `revalidatePath()` へ置き換わる。つまりこれは途中の形である。
   */
  const refreshServer = useCallback(() => router.refresh(), [router]);

  // 通知をタップしたとき、すでに開いているものは開き直さずに切り替える
  // （spec「すでにアプリが開いているとき」）。送り手は public/sw.js。
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "remoru:open-review") return;
      setSettingsOpen(false);
      // 経路ごと移る。タブは経路が決めるので、状態だけ変えても
      // 下部タブの選択と食い違う
      router.push("/review");
      void load();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load, router]);

  if (settingsOpen) {
    return <NotificationSettings onClose={() => setSettingsOpen(false)} />;
  }

  if (initialTab === "record") {
    return <RecordTab />;
  }

  return (
    <ReviewTab
      items={due}
      loading={loading}
      onFinished={() => {
        void load();
        refreshServer();
      }}
      onGoToMemos={() => router.push("/")}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );
}
