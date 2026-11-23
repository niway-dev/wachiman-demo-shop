import { DEMO_USERS, createAuth, seedDemoUsers } from "@demo-shop/infra-auth"
import {
  migrateDatabase,
  openDatabase,
  resolveDatabasePath,
  seedProducts,
} from "@demo-shop/infra-db"
import { mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import { assertResettable } from "./db-reset-guard.ts"
import { ensureEnv } from "./ensure-env.ts"

/**
 * Deletes the database file, applies the migrations and seeds the demo data:
 * one admin, one customer and the catalog. Every run starts from the same
 * state. Prints the elapsed milliseconds.
 */
const started = performance.now()

if (await ensureEnv()) console.log("created local settings file with a generated secret")

const path = resolveDatabasePath(process.env.DATABASE_PATH)
assertResettable(path, process.env.DB_RESET_ALLOW_OUTSIDE_DATA === "1")
mkdirSync(dirname(path), { recursive: true })
for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true })

const handle = openDatabase(path)
migrateDatabase(handle)
seedProducts(handle.db)

const auth = createAuth({
  db: handle.db,
  // Only used to sign cookies at request time; seeding never creates a session.
  secret: process.env.BETTER_AUTH_SECRET ?? "seed-only-secret-seed-only-secret-1234",
  baseURL: process.env.WEB_ORIGIN ?? "http://localhost:3000",
})
await seedDemoUsers(auth, handle.db)
handle.sqlite.close()

const elapsed = Math.round(performance.now() - started)
console.log(`db:reset done in ${elapsed} ms -> ${path}`)
for (const user of DEMO_USERS) console.log(`  ${user.role}: ${user.email} / ${user.password}`)
