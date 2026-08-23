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

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
