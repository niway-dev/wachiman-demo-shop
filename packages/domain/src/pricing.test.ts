import { describe, expect, test } from "bun:test"
import type { Coupon } from "./coupon.ts"
import { money } from "./money.ts"
import { priceCart } from "./pricing.ts"
import type { Promotion } from "./promotion.ts"

const NOW = 1_000
const line = (productId: string, unit: number, quantity: number) => ({
  productId,
  unitPrice: money(unit),
  quantity,
})
const fixed500: Coupon = {
  code: "F",
  discount: { kind: "fixed", amount: money(500) },
  usageLimit: 5,
  expiresAt: 2_000,
}
const ten: Promotion = { id: "ten", kind: "percentage", percent: 10 }
const half: Promotion = { id: "half", kind: "percentage", percent: 50 }
const b2g1: Promotion = { id: "b2g1", kind: "buyTwoGetOne" }

describe("priceCart", () => {
  test("empty cart totals 0", () => {
    const r = priceCart({ lines: [] }, [ten], null, NOW)
    expect(r.total).toBe(0 as never)
    expect(r.lines).toEqual([])
  })

  test("no promotions: total is the subtotal", () => {
    const r = priceCart({ lines: [line("a", 1999, 2)] }, [], null, NOW)
    expect(r.subtotal).toBe(3998 as never)
    expect(r.total).toBe(3998 as never)
    expect(r.lines[0]?.promotionId).toBeNull()
  })

  test("10% off 1999 prices the line at 1799", () => {
    const r = priceCart({ lines: [line("a", 1999, 1)] }, [ten], null, NOW)
    expect(r.lines[0]).toEqual({
      productId: "a",
      subtotal: 1999 as never,
      discount: 200 as never,
      promotionId: "ten",
    })
    expect(r.total).toBe(1799 as never)
  })

  test("one line takes only the best promotion", () => {
    const r = priceCart({ lines: [line("a", 1000, 3)] }, [ten, half, b2g1], null, NOW)
    expect(r.lines[0]?.promotionId).toBe("half")
    expect(r.lineDiscountTotal).toBe(1500 as never)
    expect(r.total).toBe(1500 as never)
  })

  test("order: line promotions, then coupon, then threshold", () => {
    // 2 x 6000 = 12000, 10% off -> 1200 off -> 10800.
    // coupon 500 off 10800; threshold sees 10800 (>= 10000) -> 1000 off. 10800 - 500 - 1000 = 9300.
    const r = priceCart(
      { lines: [line("a", 6000, 2)] },
      [ten],
      { coupon: fixed500, redemptions: 0 },
      NOW,
    )
    expect(r.discountedSubtotal).toBe(10800 as never)
    expect(r.couponDiscount).toBe(500 as never)
    expect(r.thresholdDiscount).toBe(1000 as never)
    expect(r.total).toBe(9300 as never)
  })

  test("threshold looks at the subtotal after line discounts, not before", () => {
    // gross 10000 qualifies, but 10% off the line leaves 9000: no threshold.
    const r = priceCart({ lines: [line("a", 10000, 1)] }, [ten], null, NOW)
    expect(r.subtotal).toBe(10000 as never)
    expect(r.thresholdDiscount).toBe(0 as never)
    expect(r.total).toBe(9000 as never)
  })

  test("threshold is not reduced by the coupon", () => {
    // 10000 after lines; coupon 500 would leave 9500, yet threshold still applies.
    const r = priceCart(
      { lines: [line("a", 10000, 1)] },
      [],
      { coupon: fixed500, redemptions: 0 },
      NOW,
    )
    expect(r.thresholdDiscount).toBe(1000 as never)
    expect(r.total).toBe(8500 as never)
  })

  test("a fixed coupon larger than the subtotal floors the total at 0", () => {
    const r = priceCart(
      { lines: [line("a", 300, 1)] },
      [],
      { coupon: fixed500, redemptions: 0 },
      NOW,
    )
    expect(r.couponDiscount).toBe(300 as never)
    expect(r.total).toBe(0 as never)
  })

  test("100% promotion gives a total of 0", () => {
    const free: Promotion = { id: "free", kind: "percentage", percent: 100 }
    expect(priceCart({ lines: [line("a", 1999, 1)] }, [free], null, NOW).total).toBe(0 as never)
  })

  test("an expired, exhausted or unknown coupon takes off 0 and says why", () => {
    const cart = { lines: [line("a", 1000, 1)] }
    expect(priceCart(cart, [], { coupon: fixed500, redemptions: 0 }, 2_000).couponRejection).toBe(
      "expired",
    )
    expect(priceCart(cart, [], { coupon: fixed500, redemptions: 5 }, NOW).couponRejection).toBe(
      "exhausted",
    )
    const unknown = priceCart(cart, [], { coupon: undefined, redemptions: 0 }, NOW)
    expect(unknown.couponRejection).toBe("not_found")
    expect(unknown.total).toBe(1000 as never)
  })

  test("a coupon expiring exactly at now is rejected", () => {
    const r = priceCart(
      { lines: [line("a", 1000, 1)] },
      [],
      { coupon: fixed500, redemptions: 0 },
      2_000,
    )
    expect(r.couponDiscount).toBe(0 as never)
  })

  test("a line with quantity 0 or negative is rejected", () => {
    expect(() => priceCart({ lines: [line("a", 100, 0)] }, [], null, NOW)).toThrow(RangeError)
    expect(() => priceCart({ lines: [line("a", 100, -2)] }, [], null, NOW)).toThrow(RangeError)
  })
})
