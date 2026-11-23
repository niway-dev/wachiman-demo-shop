import { expect, test } from "bun:test"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

test("a failed order write rolls the whole checkout back and the caller sees an error", async () => {
  const shop = await getTestApp()
  const { sqlite } = shop.handle
  const { client } = await clientFor(shop, "customer")
  const stockOf = () =>
    sqlite
      .query<{ stock: number }, []>("select stock from products where id = 'prod-notebook'")
      .get()!.stock
  const orderCount = () =>
    sqlite.query<{ n: number }, []>("select count(*) as n from orders").get()!.n
  const stockBefore = stockOf()
  const ordersBefore = orderCount()

  // Force the order insert to fail inside the checkout transaction.
  sqlite.run(
    "create trigger oracle_fail_orders before insert on orders begin select raise(abort, 'forced failure'); end",
  )
  try {
    await expect(
      client.cart.checkout({ lines: [{ productId: "prod-notebook", quantity: 1 }] }),
    ).rejects.toBeDefined()
  } finally {
    sqlite.run("drop trigger if exists oracle_fail_orders")
  }

  expect(orderCount()).toBe(ordersBefore)
  expect(stockOf()).toBe(stockBefore)
})
