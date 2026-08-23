/**
 * プッシュの配信。
 *
 * 送信の実体を差し替えられる形にしてある。テストは偽の送信先を渡し、
 * ネットワークに出ずに成功・期限切れ・その他の失敗を確かめる。
 */

export type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendOutcome = "sent" | "expired" | "failed";

/** 1件送る関数。実体は cron worker が Web Crypto を使う実装を渡す。 */
export type SendOne = (
  subscription: Subscription,
  payload: string,
) => Promise<SendOutcome>;

/**
 * 送信先からの応答を、扱いの分類に落とす。
 *
 * 404/410 は購読がもう有効でないことを示す（RFC 8030）。それ以外の
 * 失敗は一時的なものとして扱い、購読は消さない。
 *
 * 純粋関数にしてあるのは、実際の送信経路（cron-worker/src/send.ts）を
 * 通さずに分類そのものを検証するため。ここを実行しないテストでは、
 * 「410 を落とす」「403 を期限切れに含める」といった誤りが検出できない。
 */
export function classifyResponse(status: number): SendOutcome {
  if (status === 404 || status === 410) return "expired";
  if (status >= 200 && status < 300) return "sent";
  return "failed";
}

export type DeliveryResult = {
  sent: number;
  expired: string[];
  failed: number;
};

/**
 * 複数の購読へ送る。
 *
 * ある購読への配信が失敗しても、残りへの配信を続ける。期限切れと分かった
 * ものは呼び出し側が取り除けるよう返す（spec の要件）。
 */
export async function deliver(
  subscriptions: Subscription[],
  payload: string,
  sendOne: SendOne,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, expired: [], failed: 0 };

  for (const subscription of subscriptions) {
    let outcome: SendOutcome;
    try {
      outcome = await sendOne(subscription, payload);
    } catch {
      // 送信の実装が例外を投げても、残りを止めない
      outcome = "failed";
    }

    if (outcome === "sent") result.sent += 1;
    else if (outcome === "expired") result.expired.push(subscription.id);
    else result.failed += 1;
  }

  return result;
}
