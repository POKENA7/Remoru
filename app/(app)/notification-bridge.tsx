"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 通知をタップしたとき、すでに開いているものを復習へ切り替える。
 *
 * spec「すでにアプリが開いているとき」: 新しく開き直さない。送り手は
 * `public/sw.js` で、`remoru:open-review` を postMessage してくる。
 *
 * **画面を持たない。** どのタブを開いていても効く必要があるので、
 * `(app)/layout.tsx` に置く。
 */
export function NotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "remoru:open-review") return;
      // 経路ごと移る。タブは経路が決めるので、状態だけ変えても
      // 下部タブの選択と食い違う
      router.push("/review");
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
