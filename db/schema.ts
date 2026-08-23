import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),

  // 認証は change 3 で導入する。それまでは固定値（lib/memos.ts の
  // SINGLE_USER_ID）で埋める。列を最初から置いておくことで、認証を
  // 接続するときにデータ移行ではなく配線の変更だけで済む。
  userId: text("user_id").notNull(),

  content: text("content").notNull(),

  // エポックミリ秒
  createdAt: integer("created_at").notNull(),
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
export const reviewSchedules = sqliteTable("review_schedules", {
  quizItemId: text("quiz_item_id")
    .primaryKey()
    .references(() => quizItems.id, { onDelete: "cascade" }),

  // エポックミリ秒。日付の境界は lib/review-scheduler.ts が決める。
  nextReviewAt: integer("next_review_at").notNull(),

  // スケジューラの内部状態（JSON 文字列）。不透明。
  state: text("state").notNull(),
});

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
export type QuizItem = typeof quizItems.$inferSelect;
export type NewQuizItem = typeof quizItems.$inferInsert;
export type ReviewSchedule = typeof reviewSchedules.$inferSelect;
