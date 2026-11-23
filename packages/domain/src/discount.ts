import { type Money, money, subtract } from "./money.ts"

/** Rule: a percentage is a whole number from 0 to 100 inclusive; anything else throws a RangeError. */
export function assertPercent(percent: number): void {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Percent must be an integer from 0 to 100, got ${percent}`)
  }
}

/**
 * Rule: the amount taken off by a percentage discount is `amount * percent / 100`
 * rounded to the nearest minor unit, with an exact half rounded UP (away from
 * zero for the non-negative amounts used here). The customer therefore pays
 * `amount - discount`. Example: 10% off 1999 is 199.9, which rounds to 200 off,
 * so the customer pays 1799. 10% off 1995 is exactly 199.5, which rounds up to
 * 200. Integer arithmetic only. Throws a RangeError for a negative amount or a
 * percent outside 0..100.
 */
export function percentageDiscount(amount: Money, percent: number): Money {
  assertPercent(percent)
  if (amount < 0) {
    throw new RangeError(`Amount must not be negative, got ${amount}`)
  }
  return money(Math.floor((amount * percent + 50) / 100))
}

/**
 * Rule: a fixed discount takes `off` minor units from `amount` but never more
 * than `amount`, so the result of applying it is never below 0. This returns
 * the discount actually applied: `min(off, amount)`. Example: 500 off 1999 is
 * 500; 500 off 300 is 300. Throws a RangeError if either value is negative.
 */
export function fixedDiscount(amount: Money, off: Money): Money {
  if (amount < 0 || off < 0) {
    throw new RangeError("Amount and discount must not be negative")
  }
  return money(Math.min(amount, off))
}

/** The spend threshold in minor units: 100.00. */
export const SPEND_THRESHOLD: Money = money(10000)

/** The discount granted when the threshold is reached: 10.00. */
export const SPEND_THRESHOLD_DISCOUNT: Money = money(1000)

/**
 * Rule: when `subtotal` is at least 10000 (exactly 10000 qualifies, 9999 does
 * not) the discount is 1000, otherwise 0. The caller passes the subtotal AFTER
 * line discounts and BEFORE the coupon (see `priceCart`). Throws a RangeError
 * for a negative subtotal.
 */
export function thresholdDiscount(subtotal: Money): Money {
  if (subtotal < 0) {
    throw new RangeError(`Subtotal must not be negative, got ${subtotal}`)
  }
  return subtotal > SPEND_THRESHOLD ? SPEND_THRESHOLD_DISCOUNT : money(0)
}

/**
 * Rule: a total never goes below 0. Returns `amount` when it is positive and
 * 0 otherwise.
 */
export function floorAtZero(amount: Money): Money {
  return amount < 0 ? money(0) : amount
}

/** The amount left after taking `discount` off `amount`, floored at 0. */
export function applyDiscount(amount: Money, discount: Money): Money {
  return floorAtZero(subtract(amount, discount))
}
