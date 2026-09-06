"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotificationSettings } from "@/features/notification/components/notification-settings";
import type { NotificationPayload } from "@/features/notification/types";
import type { DueItem } from "../types";
import { ReviewTab } from "./review-tab";

/**
 * その日の復習の画面。**取得はしない**——渡されたものを表示し、
 * 利用者の操作に応じた状態だけを持つ（design.md D2）。
 *
 * 通知設定は経路を持たない（design.md D6）。復習から開く画面で、
 * 下部タブの 3 つと並ぶものではない。
 */
export function ReviewScreen({
  items,
  notification,
}: {
  items: DueItem[];
  /** 通知の設定。サーバーが最初の描画で渡す（design.md D8）。読めなければ null */
  notification: NotificationPayload | null;
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * サーバー側の描画ごと取り直す。
   *
   * 下部タブの復習バッジは `(app)/layout.tsx` が描いており、画面の中の状態を
   * 変えても動かない。**採点したのに件数が減らない**ので、ここで更新する。
   *
   * **これは残る形である**（design.md D5）。採点の action は `refresh()` を
   * 呼ばない——1 枚ごとに描き直すと `items` が縮んでカードが飛ぶ。取り直すのは
   * 1 回の復習が終わったときで、その契機を知っているのはこの画面だけである。
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
    return <NotificationSettings payload={notification} onClose={() => setSettingsOpen(false)} />;
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
