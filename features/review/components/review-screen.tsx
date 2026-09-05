"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotificationSettings } from "@/features/notification/components/notification-settings";
import type { DueItem } from "../types";
import { ReviewTab } from "./review-tab";

/**
 * その日の復習の画面。**取得はしない**——渡されたものを表示し、
 * 利用者の操作に応じた状態だけを持つ（design.md D2）。
 *
 * 通知設定は経路を持たない（design.md D6）。復習から開く画面で、
 * 下部タブの 3 つと並ぶものではない。
 */
export function ReviewScreen({ items }: { items: DueItem[] }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * サーバー側の描画ごと取り直す。
   *
   * 下部タブの復習バッジは `(app)/layout.tsx` が描いており、画面の中の状態を
   * 変えても動かない。**採点したのに件数が減らない**ので、ここで更新する。
   *
   * 次の change で Server Actions にしたとき `revalidatePath()` に置き換わる。
   * つまりこれは途中の形である（design.md D9）。
   */
  const refresh = useCallback(() => router.refresh(), [router]);

  /**
   * 通知をタップしたら設定を閉じる。
   *
   * 経路を移すのは `(app)/notification-bridge.tsx` だが、**すでに `/review` に
   * いる場合は同じ経路への遷移なので再 mount されない**。設定を開いたままだと
   * 開いたままになり、「復習を始められる画面」が出ない
   * （spec「すでにアプリが開いているとき」）。設定はこの画面の状態なので、
   * 閉じるのもこの画面の仕事である。
   */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "remoru:open-review") setSettingsOpen(false);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (settingsOpen) {
    return <NotificationSettings onClose={() => setSettingsOpen(false)} />;
  }

  return (
    <ReviewTab
      items={items}
      loading={false}
      onFinished={refresh}
      onGoToMemos={() => router.push("/")}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );
}
