import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import * as schema from "./schema.ts"

export type ShopDatabase = ReturnType<typeof drizzle<typeof schema>>

export interface DatabaseHandle {
  readonly sqlite: Database
  readonly db: ShopDatabase
}

/**
 * Where the generated SQL migrations live. Resolved in this order:
 * 1. `MIGRATIONS_DIR`, an explicit override.
 * 2. `drizzle/` next to this file. In a bundle (`bun build` puts everything in one
 *    `dist/main.js`) this is `dist/drizzle`, which the shop-api build script copies
 *    from `packages/infra-db/drizzle`, so the build output is self-contained.
 * 3. `drizzle/` next to this package's `src/`, which is where it is when running
 *    from source (dev, tests).
 */
export const migrationsFolder = resolveMigrationsFolder(process.env.MIGRATIONS_DIR)

function resolveMigrationsFolder(override: string | undefined): string {
  if (override && override.length > 0) return override
  const bundled = join(import.meta.dir, "drizzle")
  return existsSync(bundled) ? bundled : join(import.meta.dir, "..", "drizzle")
}

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

const repositoryRoot = join(import.meta.dir, "..", "..", "..")

/**
 * Resolves the database path. A relative path is relative to the repository
 * root (not to the app's working directory), so every app and script opens the
 * same file. Defaults to `data/shop.db`.
 */
export function resolveDatabasePath(path: string | undefined): string {
  const value = path && path.length > 0 ? path : "data/shop.db"
  if (value === ":memory:") return value
  return isAbsolute(value) ? value : join(repositoryRoot, value)
}
