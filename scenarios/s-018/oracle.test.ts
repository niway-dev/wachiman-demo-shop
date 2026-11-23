import { expect, test } from "bun:test"
import { validateCoupon, type Coupon } from "../packages/domain/src/index.ts"

const coupon: Coupon = {
  code: "SAVE10",
  discount: { kind: "percentage", percent: 10 },
  usageLimit: 5,
  expiresAt: Date.UTC(2026, 11, 31),
}

test("a coupon is expired at exactly its expiry instant", () => {
  expect(validateCoupon(coupon, { redemptions: 0, now: coupon.expiresAt - 1 }).ok).toBe(true)
  expect(validateCoupon(coupon, { redemptions: 0, now: coupon.expiresAt })).toEqual({
    ok: false,
    reason: "expired",
  })
})
