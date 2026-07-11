import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  notificationHour: integer("notification_hour").notNull().default(8),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: integer("created_at").notNull(),
});

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  quizMode: text("quiz_mode", { enum: ["ai", "manual"] }).notNull(),
  createdAt: integer("created_at").notNull(),
});

export const quizItems = sqliteTable("quiz_items", {
  id: text("id").primaryKey(),
  memoId: text("memo_id").notNull().references(() => memos.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed"] })
    .notNull()
    .default("pending"),
});

export const reviewCards = sqliteTable("review_cards", {
  id: text("id").primaryKey(),
  quizItemId: text("quiz_item_id").notNull().references(() => quizItems.id),
  userId: text("user_id").notNull().references(() => users.id),
  easeFactor: real("ease_factor").notNull().default(2.5),
  intervalDays: integer("interval_days").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  dueDate: integer("due_date").notNull(),
  lastReviewedAt: integer("last_reviewed_at"),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  keysP256dh: text("keys_p256dh").notNull(),
  keysAuth: text("keys_auth").notNull(),
});
