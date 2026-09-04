import { buildNotification } from "../../features/notification/notification-message";
import {
  type NotificationTarget,
  selectTargets,
} from "../../features/notification/notification-timing";
import { deliver, type SendOne, type Subscription } from "../../features/notification/push";
import { startOfReviewDay } from "../../features/review/review-scheduler";
import { sendOne } from "./send";

/**
 * 通知の cron worker。
 *
 * **本体アプリへ HTTP 呼び出しをしない**（design.md D1）。同じ D1 を
 * バインドして直接読み、自分でプッシュを送る。先行実装は本体の内部
 * エンドポイントを共有シークレットで叩いており、そのために
 * `/api/internal/(.*)` が認証から除外され、要求本文の userId を信じる
 * 作りになっていた。その経路そのものを持たない。
 */

export type Env = {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
};

/** 出題対象の件数と、出題順で先頭の問い。 */
type DueSummary = { count: number; firstQuestion: string };

/** その利用者の、今日の出題対象をまとめる。答えとメモ本文は取らない。 */
async function summarizeDue(
  db: D1Database,
  userId: string,
  todayStartMs: number,
): Promise<DueSummary | null> {
  const rows = await db
    .prepare(
      `SELECT q.question AS question
         FROM review_schedules s
         JOIN quiz_items q ON q.id = s.quiz_item_id
         JOIN memos m      ON m.id = q.memo_id
        WHERE m.user_id = ?1 AND s.next_review_at <= ?2
        ORDER BY s.next_review_at ASC, q.id ASC`,
    )
    .bind(userId, todayStartMs)
    .all<{ question: string }>();

  const results = rows.results ?? [];
  if (results.length === 0) return null;
  return { count: results.length, firstQuestion: results[0].question };
}

async function subscriptionsFor(db: D1Database, userId: string): Promise<Subscription[]> {
  const rows = await db
    .prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1`)
    .bind(userId)
    .all<Subscription>();
  return rows.results ?? [];
}

/**
 * 送信の実体は差し替えられる。既定は Web Crypto を使う実装。
 *
 * テストからネットワークに出ずに「誰へ送ったか」を確かめるための口で
 * あり、本番の経路は既定値のまま変わらない。
 */
export async function runNotifications(
  env: Env,
  now: number,
  send: SendOne = (subscription, payload) => sendOne(env, subscription, payload),
): Promise<void> {
  const settings = await env.DB.prepare(
    `SELECT user_id AS userId, enabled, hour, time_zone AS timeZone,
            last_sent_on AS lastSentOn
       FROM notification_settings`,
  ).all<{
    userId: string;
    enabled: number;
    hour: number;
    timeZone: string;
    lastSentOn: string | null;
  }>();

  const targets: NotificationTarget[] = (settings.results ?? []).map((r) => ({
    userId: r.userId,
    enabled: Boolean(r.enabled),
    hour: r.hour,
    timeZone: r.timeZone,
    lastSentOn: r.lastSentOn,
  }));

  const selected = selectTargets(targets, now);

  for (const { userId, localDate } of selected) {
    // 一人ぶんの失敗が全体を止めないようにする
    try {
      // 「今日の出題対象」の切り方は本体アプリと同じでなければならない。
      // 本体（lib/review.ts）は startOfReviewDay で切っており、cron が
      // 独自に利用者の地域で切ると、復習タブには出ているのに通知が来ない
      // （またはその逆）という食い違いが起きる。
      const due = await summarizeDue(env.DB, userId, startOfReviewDay(now));
      // 届けるものが無い日は黙っている（spec の要件）
      if (!due) continue;

      const subs = await subscriptionsFor(env.DB, userId);
      if (subs.length === 0) continue;

      // **送る前に**その日を確保する（design.md D4）。
      // 「送ってから記録」では、cron が並行して二度起きたときに両方が
      // 更新前の値を読み、同じ端末へ二度届く。条件付き UPDATE にして
      // 変更行数を見れば、確保できたのは一方だけになる。
      //
      // 確保に成功したあとで配信が失敗した場合、その日はもう送られない。
      // 「届かない日がある」より「二度鳴る」ほうが害が大きいという判断で
      // この向きに倒している（配信の保証は Non-Goal）。
      const claim = await env.DB.prepare(
        `UPDATE notification_settings
            SET last_sent_on = ?1
          WHERE user_id = ?2
            AND (last_sent_on IS NULL OR last_sent_on <> ?1)`,
      )
        .bind(localDate, userId)
        .run();
      if ((claim.meta?.changes ?? 0) === 0) continue;

      const payload = JSON.stringify(buildNotification(due.count, { question: due.firstQuestion }));
      const result = await deliver(subs, payload, send);

      // 期限切れの購読を取り除く。1件の失敗で残りを止めない。
      for (const id of result.expired) {
        try {
          await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?1`).bind(id).run();
        } catch (error) {
          console.error("期限切れの購読を削除できなかった", id, error);
        }
      }
    } catch (error) {
      console.error("通知の配信に失敗", userId, error);
    }
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await runNotifications(env, Date.now());
  },
} satisfies ExportedHandler<Env>;
