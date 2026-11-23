import { expect, test } from "bun:test"
import { money, validateCoupon } from "../packages/domain/src/index.ts"

test("a coupon that is both expired and exhausted is reported as expired", () => {
  const coupon = {
    code: "SAVE",
    discount: { kind: "fixed" as const, amount: money(500) },
    usageLimit: 3,
    expiresAt: 1_000,
  }
  expect(validateCoupon(coupon, { redemptions: 9, now: 2_000 })).toEqual({
    ok: false,
    reason: "expired",
  })
})
