import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import type { AppDb } from "../db/types";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

/**
 * インメモリ SQLite にマイグレーションを適用したデータベースを返す。
 *
 * スキーマを手書きで複製せず drizzle が生成した SQL をそのまま流すため、
 * マイグレーションを追加したときにテスト側が自動で追随する。
 */
export function createTestDb(): AppDb {
  const sqlite = new Database(":memory:");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`マイグレーションが見つかりません: ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return drizzle(sqlite, { schema }) as AppDb;
}
