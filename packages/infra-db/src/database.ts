import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { join } from "node:path"
import * as schema from "./schema.ts"

export type ShopDatabase = ReturnType<typeof drizzle<typeof schema>>

export interface DatabaseHandle {
  readonly sqlite: Database
  readonly db: ShopDatabase
}

/** Where the generated SQL migrations live, next to this package's source. */
export const migrationsFolder = join(import.meta.dir, "..", "drizzle")

/**
 * Opens a SQLite file with Bun's built-in driver and wraps it in drizzle.
 * Pass ":memory:" for a throwaway database. Foreign keys are switched on for
 * every connection because SQLite leaves them off by default.
 */
export function openDatabase(path: string): DatabaseHandle {
  const sqlite = new Database(path, { create: true, strict: true })
  sqlite.run("PRAGMA foreign_keys = ON")
  if (path !== ":memory:") sqlite.run("PRAGMA journal_mode = WAL")
  return { sqlite, db: drizzle(sqlite, { schema }) }
}

/** Applies every pending migration from `migrationsFolder`. */
export function migrateDatabase(handle: DatabaseHandle): void {
  migrate(handle.db, { migrationsFolder })
}
