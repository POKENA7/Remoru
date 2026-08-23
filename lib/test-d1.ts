import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations");

/**
 * インメモリ SQLite を D1 の形に見せる薄い層。cron worker のテスト用。
 *
 * cron worker は drizzle を通さず D1 を直接引くため、本体側の
 * `createTestDb()` では代用できない。マイグレーションは本体と同じ
 * ファイルを流すので、スキーマの複製は生じない。
 */
export function createTestD1(): D1Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return new FakeD1(sqlite) as unknown as D1Database;
}

/**
 * D1 の `?1` 形式を better-sqlite3 が受け取れる名前付きに直す。
 *
 * better-sqlite3 は番号付きの `?N` に配列を渡せない（"Too many parameter
 * values were provided" で落ちる）。順番に `?` へ潰すと、同じ番号を2回
 * 使う文（cron の確保用 UPDATE がそう）が壊れるため、名前付きにする。
 */
function toNamed(sql: string): string {
  const rewritten = sql.replace(/\?(\d+)/g, "@p$1");
  if (/\?(?!\d)/.test(rewritten)) {
    throw new Error(`番号のない ? は扱えません: ${sql}`);
  }
  return rewritten;
}

function toBindings(values: unknown[]): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  values.forEach((value, i) => {
    bindings[`p${i + 1}`] =
      typeof value === "boolean" ? (value ? 1 : 0) : value === undefined ? null : value;
  });
  return bindings;
}

class FakeD1 {
  constructor(private readonly sqlite: Database.Database) {}

  prepare(sql: string) {
    return new FakeStatement(this.sqlite, toNamed(sql), {});
  }
}

class FakeStatement {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly sql: string,
    private readonly bindings: Record<string, unknown>,
  ) {}

  bind(...values: unknown[]) {
    return new FakeStatement(this.sqlite, this.sql, toBindings(values));
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const statement = this.sqlite.prepare(this.sql);
    return { results: statement.all(this.bindings) as T[], success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const info = this.sqlite.prepare(this.sql).run(this.bindings);
    return { success: true, meta: { changes: info.changes } };
  }
}
