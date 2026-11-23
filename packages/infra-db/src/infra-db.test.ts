import { describe, expect, test } from "bun:test"
import { listProducts } from "@demo-shop/application"
import { Effect } from "effect"
import {
  SEED_PRODUCTS,
  migrateDatabase,
  openDatabase,
  ProductRepositoryLive,
  seedProducts,
} from "./index.ts"

function freshDatabase() {
  const handle = openDatabase(":memory:")
  migrateDatabase(handle)
  return handle
}

describe("infra-db", () => {
  test("migrations create the shop and auth tables", () => {
    const { sqlite } = freshDatabase()
    const names = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => row.name)
    for (const table of ["user", "session", "account", "verification", "products"]) {
      expect(names).toContain(table)
    }
  })

  test("the repository lists seeded products with prices in minor units", async () => {
    const handle = freshDatabase()
    seedProducts(handle.db)
    const products = await Effect.runPromise(
      listProducts().pipe(Effect.provide(ProductRepositoryLive(handle.db))),
    )
    expect(products).toHaveLength(SEED_PRODUCTS.length)
    const mug = products.find((product) => product.id === "prod-mug")
    expect(mug?.price).toBe(1850 as never)
  })

  test("foreign keys are enforced", () => {
    const { sqlite } = freshDatabase()
    const insertSession = () =>
      sqlite.run(
        "insert into session (id, expires_at, token, user_id, created_at, updated_at) values ('s', 1, 't', 'missing', 1, 1)",
      )
    expect(insertSession).toThrow()
  })
})
