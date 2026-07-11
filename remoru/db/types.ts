import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

// Works for both the D1 driver (async) used in production and the
// better-sqlite3 driver (sync) used in unit tests, since both expose
// the same query-builder surface.
export type AppDb = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;
