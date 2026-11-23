import { fixedDiscount, percentageDiscount } from "./discount.ts"
import type { Money } from "../money.ts"

/** What a coupon takes off the cart: a percentage or a fixed amount. */
export type CouponDiscount =
  | { readonly kind: "percentage"; readonly percent: number }
  | { readonly kind: "fixed"; readonly amount: Money }

/**
 * A coupon. `usageLimit` is the most redemptions allowed in total and
 * `expiresAt` is an instant in milliseconds since the epoch.
 */
export interface Coupon {
  readonly code: string
  readonly discount: CouponDiscount
  readonly usageLimit: number
  readonly expiresAt: number
}

export type CouponRejection = "not_found" | "expired" | "exhausted" | "already_applied"

export type CouponValidation =
  | { readonly ok: true; readonly coupon: Coupon }
  | { readonly ok: false; readonly reason: CouponRejection }

export interface CouponCheck {
  /** Redemptions already counted for this coupon. */
  readonly redemptions: number
  /** The current instant in milliseconds since the epoch. */
  readonly now: number
  /** True when the order already carries a coupon: at most one per order. */
  readonly orderHasCoupon?: boolean
}

/**
 * Rule: a coupon is usable only when all of these hold, checked in this order
 * and reported as the first failing reason:
 * 1. a coupon exists (`undefined` is "not_found");
 * 2. the order has no coupon yet (otherwise "already_applied");
 * 3. it has not expired: expiry is EXCLUSIVE of the instant `expiresAt`, so
 *    when `now >= expiresAt` the result is "expired" and one millisecond
 *    earlier it is still valid;
 * 4. it is not exhausted: when `redemptions >= usageLimit` the result is
 *    "exhausted", so the last allowed redemption is the one that makes the
 *    count equal the limit.
 * Otherwise the result is `{ ok: true, coupon }`.
 */
export function validateCoupon(coupon: Coupon | undefined, check: CouponCheck): CouponValidation {
  if (coupon === undefined) return { ok: false, reason: "not_found" }
  if (check.orderHasCoupon === true) return { ok: false, reason: "already_applied" }
  if (check.now >= coupon.expiresAt) return { ok: false, reason: "expired" }
  if (check.redemptions >= coupon.usageLimit) return { ok: false, reason: "exhausted" }
  return { ok: true, coupon }
}

/**
 * Rule: the discount a coupon takes off `base` (the cart subtotal after line
 * discounts). A percentage coupon uses the percentage rounding rule; a fixed
 * coupon takes its amount but never more than `base`. The result never
 * exceeds `base`.
 */
export function couponDiscount(discount: CouponDiscount, base: Money): Money {
  return discount.kind === "fixed"
    ? fixedDiscount(base, discount.amount)
    : percentageDiscount(base, discount.percent)
}
