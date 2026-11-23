import { describe, expect, test } from "bun:test"
import { checkout, listProducts } from "@demo-shop/application"
import { sessionReaderInMemory } from "@demo-shop/application/testing"
import { Effect, Layer } from "effect"
import {
  CheckoutStoreLive,
  SEED_PRODUCTS,
  migrateDatabase,
  openDatabase,
  ProductRepositoryLive,
  seedProducts,
  seedShop,
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
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "products",
      "promotions",
      "coupons",
      "orders",
      "order_lines",
    ]) {
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

  describe("checkout transaction", () => {
    /** A shop with the demo data and the user the in-memory session reader signs in. */
    function shopWithCustomer() {
      const handle = freshDatabase()
      seedShop(handle.db)
      handle.sqlite.run(
        "insert into user (id, name, email, role, created_at, updated_at) values ('user-customer', 'c', 'c@example.com', 'customer', 1, 1)",
      )
      const layer = Layer.mergeAll(CheckoutStoreLive(handle), sessionReaderInMemory())
      const headers = new Headers({ "x-test-role": "customer" })
      return { handle, layer, headers }
    }
    const count = (sqlite: ReturnType<typeof freshDatabase>["sqlite"], table: string) =>
      sqlite.query<{ n: number }, []>(`select count(*) as n from ${table}`).get()?.n

    test("a failing line rolls back the stock of the earlier lines and writes no order", async () => {
      const { handle, layer, headers } = shopWithCustomer()
      const error = await Effect.runPromise(
        Effect.flip(
          checkout(headers, {
            lines: [
              { productId: "prod-pen", quantity: 1 },
              { productId: "prod-lamp", quantity: 999 },
            ],
            couponCode: "WELCOME5",
          }),
        ).pipe(Effect.provide(layer)),
      )
      expect(error).toMatchObject({ _tag: "InsufficientStock", productId: "prod-lamp" })
      const pen = handle.sqlite
        .query<{ stock: number }, []>("select stock from products where id = 'prod-pen'")
        .get()
      expect(pen?.stock).toBe(200)
      expect(count(handle.sqlite, "orders")).toBe(0)
      expect(count(handle.sqlite, "order_lines")).toBe(0)
      const coupon = handle.sqlite
        .query<{ redemptions: number }, []>(
          "select redemptions from coupons where code = 'WELCOME5'",
        )
        .get()
      expect(coupon?.redemptions).toBe(0)
    })

    test("a successful checkout commits the order, the stock and the redemptions together", async () => {
      const { handle, layer, headers } = shopWithCustomer()
      await Effect.runPromise(
        checkout(headers, {
          lines: [{ productId: "prod-pen", quantity: 2 }],
          couponCode: "welcome5",
        }).pipe(Effect.provide(layer)),
      )
      expect(count(handle.sqlite, "orders")).toBe(1)
      expect(count(handle.sqlite, "order_lines")).toBe(1)
      const pen = handle.sqlite
        .query<{ stock: number }, []>("select stock from products where id = 'prod-pen'")
        .get()
      expect(pen?.stock).toBe(198)
      const coupon = handle.sqlite
        .query<{ redemptions: number }, []>(
          "select redemptions from coupons where code = 'WELCOME5'",
        )
        .get()
      expect(coupon?.redemptions).toBe(1)
    })
  })
})
