import { describe, expect, test } from "bun:test"
import { type Product, money, priceCart } from "@demo-shop/domain"
import { checkout, quoteCart } from "./checkout.ts"
import type { CouponRecord, PromotionRecord } from "./ports.ts"
import { failsIn, inMemoryShop, succeedsIn } from "./testing.ts"

const product = (id: string, price: number, stock: number): Product => ({
  id,
  name: id,
  description: id,
  price: money(price),
  stock,
})

const tenPercent: PromotionRecord = {
  id: "promo-10",
  name: "10%",
  kind: "percentage",
  percent: 10,
  active: true,
  redemptions: 0,
}

const coupon = (over: Partial<CouponRecord> = {}): CouponRecord => ({
  code: "SAVE5",
  discount: { kind: "fixed", amount: money(500) },
  usageLimit: 2,
  expiresAt: Date.now() + 86_400_000,
  active: true,
  redemptions: 0,
  ...over,
})

const customer = () => new Headers({ "x-test-role": "customer" })

/** A shop with a pen (5.00, 10 in stock) and a lamp (50.00, 2 in stock). */
function shop(over: Parameters<typeof inMemoryShop>[0] = {}) {
  return inMemoryShop({
    products: [product("pen", 500, 10), product("lamp", 5000, 2)],
    promotions: [tenPercent],
    coupons: [coupon()],
    ...over,
  })
}

describe("quoteCart", () => {
  test("prices from stored prices and counts nothing", async () => {
    const world = shop()
    const { priced } = await succeedsIn(
      world,
      quoteCart({ lines: [{ productId: "pen", quantity: 2 }], couponCode: "save5" }),
    )
    // 2 x 5.00 = 10.00, 10% line promotion = 1.00 off, coupon 5.00 off, threshold not reached.
    expect(priced.total).toBe(400 as never)
    expect(world.orders).toHaveLength(0)
    expect(world.coupons.get("SAVE5")?.redemptions).toBe(0)
  })

  test("reports a rejected coupon instead of failing", async () => {
    const world = shop()
    const { priced } = await succeedsIn(
      world,
      quoteCart({ lines: [{ productId: "pen", quantity: 1 }], couponCode: "NOPE" }),
    )
    expect(priced.couponRejection).toBe("not_found")
  })

  test("an unknown product fails with ProductNotFound", async () => {
    const error = await failsIn(shop(), quoteCart({ lines: [{ productId: "ghost", quantity: 1 }] }))
    expect(error).toMatchObject({ _tag: "ProductNotFound", productId: "ghost" })
  })
})

describe("checkout", () => {
  test("stores the order at the domain total, decrements stock and counts redemptions", async () => {
    const world = shop()
    const { order } = await succeedsIn(
      world,
      checkout(customer(), {
        lines: [
          { productId: "pen", quantity: 2 },
          { productId: "lamp", quantity: 1 },
        ],
        couponCode: "save5",
      }),
    )
    const expected = priceCart(
      {
        lines: [
          { productId: "pen", unitPrice: money(500), quantity: 2 },
          { productId: "lamp", unitPrice: money(5000), quantity: 1 },
        ],
      },
      [tenPercent],
      { coupon: coupon(), redemptions: 0 },
      Date.now(),
    )
    expect(order.total).toBe(expected.total)
    expect(world.orders).toHaveLength(1)
    expect(world.orders[0]?.userId).toBe("user-customer")
    expect(world.products.get("pen")?.stock).toBe(8)
    expect(world.products.get("lamp")?.stock).toBe(1)
    expect(world.coupons.get("SAVE5")?.redemptions).toBe(1)
    expect(world.promotions.get("promo-10")?.redemptions).toBe(1)
  })

  test("repeated products are merged into one line", async () => {
    const world = shop()
    await succeedsIn(
      world,
      checkout(customer(), {
        lines: [
          { productId: "pen", quantity: 1 },
          { productId: "pen", quantity: 2 },
        ],
      }),
    )
    expect(world.orders[0]?.lines).toHaveLength(1)
    expect(world.products.get("pen")?.stock).toBe(7)
  })

  test("insufficient stock rolls everything back", async () => {
    const world = shop()
    const error = await failsIn(
      world,
      checkout(customer(), {
        lines: [
          { productId: "pen", quantity: 1 },
          { productId: "lamp", quantity: 3 },
        ],
        couponCode: "SAVE5",
      }),
    )
    expect(error).toMatchObject({
      _tag: "InsufficientStock",
      productId: "lamp",
      available: 2,
      requested: 3,
    })
    expect(world.orders).toHaveLength(0)
    expect(world.products.get("pen")?.stock).toBe(10)
    expect(world.coupons.get("SAVE5")?.redemptions).toBe(0)
    expect(world.promotions.get("promo-10")?.redemptions).toBe(0)
  })

  test("selling exactly the stock on hand is allowed", async () => {
    const world = shop()
    await succeedsIn(world, checkout(customer(), { lines: [{ productId: "lamp", quantity: 2 }] }))
    expect(world.products.get("lamp")?.stock).toBe(0)
  })

  test.each([
    ["expired", { expiresAt: Date.now() - 1 }],
    ["exhausted", { usageLimit: 2, redemptions: 2 }],
  ] as const)("a %s coupon rejects the order and counts nothing", async (reason, over) => {
    const world = shop({ coupons: [coupon(over)] })
    const error = await failsIn(
      world,
      checkout(customer(), { lines: [{ productId: "pen", quantity: 1 }], couponCode: "SAVE5" }),
    )
    expect(error).toMatchObject({ _tag: "CouponRejected", reason })
    expect(world.orders).toHaveLength(0)
    expect(world.products.get("pen")?.stock).toBe(10)
  })

  test("a switched-off coupon is treated as not found", async () => {
    const world = shop({ coupons: [coupon({ active: false })] })
    const error = await failsIn(
      world,
      checkout(customer(), { lines: [{ productId: "pen", quantity: 1 }], couponCode: "SAVE5" }),
    )
    expect(error).toMatchObject({ _tag: "CouponRejected", reason: "not_found" })
  })

  test("a switched-off promotion does not discount the order", async () => {
    const world = shop({ promotions: [{ ...tenPercent, active: false }], coupons: [] })
    const { order } = await succeedsIn(
      world,
      checkout(customer(), { lines: [{ productId: "pen", quantity: 1 }] }),
    )
    expect(order.total).toBe(500 as never)
    expect(world.promotions.get("promo-10")?.redemptions).toBe(0)
  })

  test("the last allowed redemption works and the next one is exhausted", async () => {
    const world = shop({ coupons: [coupon({ usageLimit: 1 })] })
    const input = { lines: [{ productId: "pen", quantity: 1 }], couponCode: "SAVE5" }
    await succeedsIn(world, checkout(customer(), input))
    const error = await failsIn(world, checkout(customer(), input))
    expect(error).toMatchObject({ _tag: "CouponRejected", reason: "exhausted" })
    expect(world.orders).toHaveLength(1)
  })

  test("a visitor gets Unauthenticated and nothing is stored", async () => {
    const world = shop()
    const error = await failsIn(
      world,
      checkout(new Headers(), { lines: [{ productId: "pen", quantity: 1 }] }),
    )
    expect(error._tag).toBe("Unauthenticated")
    expect(world.orders).toHaveLength(0)
  })

  test("an empty cart fails with EmptyCart", async () => {
    const error = await failsIn(shop(), checkout(customer(), { lines: [] }))
    expect(error._tag).toBe("EmptyCart")
  })

  test("a quantity that is not a positive integer fails with InvalidQuantity", async () => {
    const error = await failsIn(
      shop(),
      checkout(customer(), { lines: [{ productId: "pen", quantity: 0 }] }),
    )
    expect(error).toMatchObject({ _tag: "InvalidQuantity", productId: "pen" })
  })
})
