import { expect, test } from "bun:test"
import { type Coupon, money, validateCoupon } from "../packages/domain/src/index.ts"

const coupon: Coupon = {
  code: "SAVE",
  discount: { kind: "fixed", amount: money(500) },
  usageLimit: 3,
  expiresAt: 1_000,
}

// docs/features/coupons.md: checks run in the order not_found, already_applied, expired,
// exhausted, and the first failure is the reason.
test("a second coupon on an order is reported before expiry", () => {
  expect(validateCoupon(coupon, { redemptions: 0, now: 2_000, orderHasCoupon: true })).toEqual({
    ok: false,
    reason: "already_applied",
  })
})

test("a second coupon on an order is reported before exhaustion", () => {
  expect(validateCoupon(coupon, { redemptions: 3, now: 0, orderHasCoupon: true })).toEqual({
    ok: false,
    reason: "already_applied",
  })
})
