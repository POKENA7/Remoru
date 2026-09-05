"use client";

import { useEffect, useState } from "react";
import { announcementText } from "../first-run-text";
import { pushSupported, subscribeToPush } from "@/features/notification/push-subscribe";

/**
 * 最初の問答ができたことの告知（design.md D3）。
 *
 * **そのメモの行の下に置く。** 「まだ覚えているか」が何について言っているかは、
 * 真上にメモがあることで決まる。一覧の上に帯として出すと文が宙に浮く。
 *
 * 通知の差し出しをここに置くのは、**何のための通知かが分かっている**位置だから
 * （design.md D4）。設定画面へ飛ばすと、その状態が失われる。
 */
export type NoticeAnswer = "done" | "failed" | null;

export function FirstRunNotice({
  nextReviewAt,
  now,
  answer,
  onAnswer,
}: {
  nextReviewAt: number;
  now: number;
  /**
   * 既に答えたか。**この画面の外で持つ。**
   *
   * タブを切り替えたりメモの詳細を開くと `MemoTab` ごと unmount されるので、
   * ここに持たせると答えたことが消え、戻ったときに同じ問いをもう一度出す。
   */
  answer: NoticeAnswer;
  onAnswer: (answer: NoticeAnswer) => void;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    // 鍵が無い環境では差し出さない。押しても何も起きないものは出さない
    void fetch("/api/notifications/settings")
      .then((r) => (r.ok ? (r.json() as Promise<{ vapidPublicKey?: string | null }>) : null))
      .then((d) => setKey(d?.vapidPublicKey ?? null))
      .catch(() => {});
  }, []);

  async function accept() {
    if (!key || busy) return;
    setBusy(true);
    try {
      const result = await subscribeToPush(key);
      if (!result.ok) {
        onAnswer("failed");
        return;
      }
      // 時刻は既定のまま。ここで選ばせない（design.md D4）
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, hour: 21, timeZone }),
      });
      onAnswer(res.ok ? "done" : "failed");
    } finally {
      setBusy(false);
    }
  }

  // 差し出せるときだけ問いかけにする。答える手段が無いまま問わない
  const offering = key !== null && answer !== "done";

  return (
    <div className="first-run-notice">
      <p className="first-run-text">{announcementText(nextReviewAt, now, offering)}</p>

      {offering && (
        <button type="button" className="btn btn-blue" onClick={accept} disabled={busy}>
          {busy ? "用意しています..." : "いいよ"}
        </button>
      )}
      {answer === "done" && <p className="first-run-sub">ありがとう！</p>}
      {answer === "failed" && (
        <p className="first-run-sub" role="alert">
          いまは用意できませんでした。通知の設定から変えられます
        </p>
      )}
    </div>
  );
}
