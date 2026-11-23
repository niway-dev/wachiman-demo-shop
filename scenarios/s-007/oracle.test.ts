import { expect, test } from "bun:test"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

test("checkout stores the server total, not a total sent by the client", async () => {
  const shop = await getTestApp()
  const { client } = await clientFor(shop, "customer")
  const lines = [{ productId: "prod-bottle", quantity: 2 }]
  const quoted = await client.cart.quote({ lines })
  expect(quoted.totalMinor).toBeGreaterThan(1)

  // A tampered request: the same cart, but claiming the order costs 1 minor unit.
  const tampered = { lines, totalMinor: 1 } as never
  const order = await client.cart.checkout(tampered)

  const stored = shop.handle.sqlite
    .query<{ total_minor: number }, [string]>("select total_minor from orders where id = ?")
    .get(order.id)
  expect(stored?.total_minor).toBe(quoted.totalMinor)
})
