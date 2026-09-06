"use client";

import { useState } from "react";
import { saveNotificationSettings } from "@/features/notification/actions";
import { pushSupported, subscribeToPush } from "@/features/notification/push-subscribe";
import { announcementText } from "../first-run-text";

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
  vapidPublicKey,
  answer,
  onAnswer,
}: {
  nextReviewAt: number;
  now: number;
  /**
   * VAPID の公開鍵。**サーバーが最初の描画で渡す**（design.md D8）。
   *
   * 鍵が無い環境では差し出さない。押しても何も起きないものは出さない。
   * 以前はここから `/api/notifications/settings` を叩いて確かめており、
   * 差し出しが一拍遅れて現れていた。
   */
  vapidPublicKey: string | null;
  /**
   * 既に答えたか。**この画面の外で持つ。**
   *
   * タブを切り替えたりメモの詳細を開くと `MemoTab` ごと unmount されるので、
   * ここに持たせると答えたことが消え、戻ったときに同じ問いをもう一度出す。
   */
  answer: NoticeAnswer;
  onAnswer: (answer: NoticeAnswer) => void;
}) {
  const [busy, setBusy] = useState(false);
  const key = pushSupported() ? vapidPublicKey : null;

  async function accept() {
    if (!key || busy) return;
    setBusy(true);
    try {
      const result = await subscribeToPush(key);
      if (!result.ok) {
        onAnswer("failed");
        return;
      }
      // 時刻は既定のまま。ここで選ばせない（change 9 D4）
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const saved = await saveNotificationSettings({ enabled: true, hour: 21, timeZone });
      onAnswer(saved.ok ? "done" : "failed");
    } catch {
      // action に辿り着けない失敗（圏外・配備後の古い識別子。design.md R2b）
      onAnswer("failed");
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
