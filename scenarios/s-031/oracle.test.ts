import { expect, test } from "bun:test"
import { migrateDatabase, openDatabase } from "../packages/infra-db/src/database.ts"

interface ColumnInfo {
  name: string
  dflt_value: string | null
}

test("a database built from the migrations switches new promotions on by default", () => {
  const handle = openDatabase(":memory:")
  migrateDatabase(handle)
  const columns = handle.sqlite.query("PRAGMA table_info('promotions')").all() as ColumnInfo[]
  expect(columns.find((column) => column.name === "active")?.dflt_value).toBe("true")
})
