import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),

  // 認証は change 3 で導入する。それまでは固定値（lib/memos.ts の
  // SINGLE_USER_ID）で埋める。列を最初から置いておくことで、認証を
  // 接続するときにデータ移行ではなく配線の変更だけで済む。
  userId: text("user_id").notNull(),

  content: text("content").notNull(),

  // エポックミリ秒
  createdAt: integer("created_at").notNull(),

  /**
   * 問答の生成を始めた時刻（エポックミリ秒）。生成していなければ null。
   *
   * 「生成中」を表すのに状態の列を別に持たない。**非 null なら生成中**、
   * それ以外は問答の有無で決まる（design.md D2）。失敗と未着手を区別
   * しないのは、spec がどちらも「未作成」として同じに扱うため。
   * 状態と時刻を別々に持つと、矛盾した組み合わせが表現できてしまう。
   */
  quizPendingSince: integer("quiz_pending_since"),
});

/** メモから作られる問と答のペア。1メモにつき最大1つ。 */
export const quizItems = sqliteTable("quiz_items", {
  id: text("id").primaryKey(),

  // メモを消したら問答も消える（design.md D5）。アプリ側で順に消さない。
  memoId: text("memo_id")
    .notNull()
    .unique()
    .references(() => memos.id, { onDelete: "cascade" }),

  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: integer("created_at").notNull(),
});

/**
 * 復習のスケジュール。
 *
 * `nextReviewAt` は state の公開された射影であり、外から読んでよい唯一の値。
 * `state` はスケジューラだけのもので、他の層は読まない・書かない・分岐しない
 * （design.md D2）。SM-2 系へ差し替えるとき変わるのはこの中身だけになる。
 */
export const reviewSchedules = sqliteTable(
  "review_schedules",
  {
    quizItemId: text("quiz_item_id")
      .primaryKey()
      .references(() => quizItems.id, { onDelete: "cascade" }),

    // エポックミリ秒。日付の境界は lib/review-scheduler.ts が決める。
    nextReviewAt: integer("next_review_at").notNull(),

    // スケジューラの内部状態（JSON 文字列）。不透明。
    state: text("state").notNull(),
  },
  // 出題対象の絞り込みで本体と cron の両方が毎回引く
  (t) => [index("review_schedules_next_review_at_idx").on(t.nextReviewAt)],
);

/**
 * 利用者ごとの通知設定。
 *
 * 利用者は Clerk 側にあるため外部キーは張らない。`lastSentOn` は
 * 「利用者の地域での日付」を YYYY-MM-DD で持ち、同じ日に二度送らない
 * ための記録として使う（design.md D4）。
 */
export const notificationSettings = sqliteTable("notification_settings", {
  userId: text("user_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  /** 通知する時刻（0-23）。利用者の地域での時刻。 */
  hour: integer("hour").notNull().default(21),
  /** IANA のタイムゾーン名。例: Asia/Tokyo */
  timeZone: text("time_zone").notNull().default("Asia/Tokyo"),
  /** 最後に送った日（利用者の地域での YYYY-MM-DD）。未送信なら null。 */
  lastSentOn: text("last_sent_on"),
});

/** プッシュの購読。端末ごとに1件で、利用者に紐づく。 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  // cron は選ばれた利用者ごとに user_id で引く
  (t) => [index("push_subscriptions_user_id_idx").on(t.userId)],
);

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
export type QuizItem = typeof quizItems.$inferSelect;
export type NewQuizItem = typeof quizItems.$inferInsert;
export type ReviewSchedule = typeof reviewSchedules.$inferSelect;
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
