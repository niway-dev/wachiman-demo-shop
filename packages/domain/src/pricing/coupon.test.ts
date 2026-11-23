import { describe, expect, test } from "bun:test"
import { type Coupon, couponDiscount, validateCoupon } from "./coupon.ts"
import { money } from "../money.ts"

const coupon: Coupon = {
  code: "SAVE",
  discount: { kind: "fixed", amount: money(500) },
  usageLimit: 3,
  expiresAt: 1_000,
}

describe("validateCoupon", () => {
  test("a valid coupon is ok", () => {
    expect(validateCoupon(coupon, { redemptions: 0, now: 999 })).toEqual({ ok: true, coupon })
  })
  test("expiry is exclusive: valid 1 ms before, expired at exactly expiresAt", () => {
    expect(validateCoupon(coupon, { redemptions: 0, now: 999 }).ok).toBe(true)
    expect(validateCoupon(coupon, { redemptions: 0, now: 1_000 })).toEqual({
      ok: false,
      reason: "expired",
    })
  })
  test("the limit is reached exactly when redemptions equals it", () => {
    expect(validateCoupon(coupon, { redemptions: 2, now: 0 }).ok).toBe(true)
    expect(validateCoupon(coupon, { redemptions: 3, now: 0 })).toEqual({
      ok: false,
      reason: "exhausted",
    })
  })
  test("unknown coupon is not_found", () => {
    expect(validateCoupon(undefined, { redemptions: 0, now: 0 })).toEqual({
      ok: false,
      reason: "not_found",
    })
  })
  test("a second coupon on an order is already_applied", () => {
    expect(validateCoupon(coupon, { redemptions: 0, now: 0, orderHasCoupon: true })).toEqual({
      ok: false,
      reason: "already_applied",
    })
  })
  test("expired is reported before exhausted", () => {
    expect(validateCoupon(coupon, { redemptions: 9, now: 2_000 })).toEqual({
      ok: false,
      reason: "expired",
    })
  })
})

describe("couponDiscount", () => {
  test("fixed coupon is capped at the base", () => {
    expect(couponDiscount({ kind: "fixed", amount: money(500) }, money(1999))).toBe(500 as never)
    expect(couponDiscount({ kind: "fixed", amount: money(500) }, money(300))).toBe(300 as never)
  })
  test("percentage coupon uses the percentage rounding rule", () => {
    expect(couponDiscount({ kind: "percentage", percent: 10 }, money(1999))).toBe(200 as never)
  })
})
