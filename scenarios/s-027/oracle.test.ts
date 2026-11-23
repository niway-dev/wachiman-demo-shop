import { expect, test } from "bun:test"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

test("two concurrent checkouts for the last unit sell it once", async () => {
  const shop = await getTestApp()
  const { sqlite } = shop.handle
  const { client } = await clientFor(shop, "customer")
  const stockOf = () =>
    sqlite.query<{ stock: number }, []>("select stock from products where id = 'prod-lamp'").get()!
      .stock
  const soldLines = () =>
    sqlite
      .query<{ n: number }, []>(
        "select coalesce(sum(quantity), 0) as n from order_lines where product_id = 'prod-lamp'",
      )
      .get()!.n
  const originalStock = stockOf()
  const soldBefore = soldLines()
  sqlite.run("update products set stock = 1 where id = 'prod-lamp'")
  try {
    const attempt = () => client.cart.checkout({ lines: [{ productId: "prod-lamp", quantity: 1 }] })
    const results = await Promise.allSettled([attempt(), attempt()])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(soldLines() - soldBefore).toBe(1)
    expect(stockOf()).toBe(0)
  } finally {
    sqlite.run("update products set stock = ? where id = 'prod-lamp'", [originalStock])
  }
})
