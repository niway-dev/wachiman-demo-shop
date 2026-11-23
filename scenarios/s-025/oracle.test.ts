import { expect, test } from "bun:test"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

test("a coupon sent with a quote or a checkout is applied", async () => {
  const shop = await getTestApp()
  const { client } = await clientFor(shop, "customer")
  const lines = [{ productId: "prod-bottle", quantity: 2 }]
  const plain = await client.cart.quote({ lines })

  // The field is sent under both of its names, so the check holds whichever name the contract uses.
  const withCoupon = { lines, couponCode: "WELCOME5", coupon: "WELCOME5" } as never
  const quoted = await client.cart.quote(withCoupon)
  expect(quoted.couponRejection).toBeNull()
  expect(quoted.couponDiscountMinor).toBeGreaterThan(0)
  expect(quoted.totalMinor).toBeLessThan(plain.totalMinor)

  const order = await client.cart.checkout(withCoupon)
  expect(order.couponCode).toBe("WELCOME5")
  expect(order.quote.totalMinor).toBe(quoted.totalMinor)
})
