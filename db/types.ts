import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/**
 * アプリ側のデータ処理が受け取るデータベースの型。
 *
 * 本番は D1（非同期）、テストはインメモリ SQLite（同期）と実体が異なるため、
 * 両方を受け入れられる基底型で受ける。呼び出し側は常に await して扱う。
 */
export type AppDb = BaseSQLiteDatabase<any, any, typeof schema>;
