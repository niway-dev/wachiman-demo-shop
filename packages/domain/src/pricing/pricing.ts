import { type Cart, lineSubtotal } from "./cart.ts"
import {
  type Coupon,
  type CouponCheck,
  type CouponRejection,
  couponDiscount,
  validateCoupon,
} from "./coupon.ts"
import { applyDiscount, thresholdDiscount } from "./discount.ts"
import { type Money, ZERO, add, subtract } from "../money.ts"
import { type Promotion, bestLinePromotion } from "./promotion.ts"

export interface PricedLine {
  readonly productId: string
  /** Unit price times quantity, before the line promotion. */
  readonly subtotal: Money
  /** What the winning line promotion takes off (0 when none). */
  readonly discount: Money
  /** The id of the winning promotion, or null when none applied. */
  readonly promotionId: string | null
}

export interface PricedCart {
  readonly lines: readonly PricedLine[]
  /** Sum of the line subtotals, before any discount. */
  readonly subtotal: Money
  /** Sum of the line discounts. */
  readonly lineDiscountTotal: Money
  /** `subtotal - lineDiscountTotal`: the base for the coupon and the threshold. */
  readonly discountedSubtotal: Money
  readonly couponDiscount: Money
  /** Why the offered coupon was not applied, or null. */
  readonly couponRejection: CouponRejection | null
  readonly thresholdDiscount: Money
  readonly total: Money
}

/** The coupon offered with a cart and the redemption count it was read with. */
export interface OfferedCoupon {
  readonly coupon: Coupon | undefined
  readonly redemptions: number
}

/**
 * Rule: the single place a cart total is computed. Discounts stack in this
 * order, and the order matters:
 * 1. Per line: of all `promotions`, apply only the ONE that gives the largest
 *    discount on that line (promotions never add up on a line).
 * 2. Cart coupon: at most ONE coupon, taken off the subtotal after line
 *    discounts. An invalid coupon (see `validateCoupon`) takes off 0 and its
 *    reason is reported in `couponRejection`.
 * 3. Spend threshold: 1000 off when the subtotal after line discounts (step
 *    1, NOT reduced by the coupon) is at least 10000.
 * 4. Floor: the total is
 *    `max(0, discountedSubtotal - couponDiscount - thresholdDiscount)`.
 * Throws a RangeError for a line with a non-positive quantity. An empty cart
 * totals 0. This function does not count a redemption: see `nextRedemptionCount`.
 */
export function priceCart(
  cart: Cart,
  promotions: readonly Promotion[],
  offered: OfferedCoupon | null,
  now: number,
): PricedCart {
  const lines: PricedLine[] = cart.lines.map((line) => {
    const subtotal = lineSubtotal(line)
    const best = bestLinePromotion(promotions, line.unitPrice, line.quantity)
    return {
      productId: line.productId,
      subtotal,
      discount: best?.discount ?? ZERO,
      promotionId: best?.promotionId ?? null,
    }
  })
  const subtotal = lines.reduce((sum, l) => add(sum, l.subtotal), ZERO)
  const lineDiscountTotal = lines.reduce((sum, l) => add(sum, l.discount), ZERO)
  const discountedSubtotal = subtract(subtotal, lineDiscountTotal)

  let couponOff: Money = ZERO
  let couponRejection: CouponRejection | null = null
  if (offered !== null) {
    const check: CouponCheck = { redemptions: offered.redemptions, now }
    const result = validateCoupon(offered.coupon, check)
    if (result.ok) couponOff = couponDiscount(result.coupon.discount, discountedSubtotal)
    else couponRejection = result.reason
  }

  const thresholdOff = thresholdDiscount(discountedSubtotal)
  const total = applyDiscount(applyDiscount(discountedSubtotal, couponOff), thresholdOff)
  return {
    lines,
    subtotal,
    lineDiscountTotal,
    discountedSubtotal,
    couponDiscount: couponOff,
    couponRejection,
    thresholdDiscount: thresholdOff,
    total,
  }
}
