import { assertQuantity } from "./cart.ts"
import { assertPercent, percentageDiscount } from "./discount.ts"
import { type Money, multiply } from "../money.ts"

/** A promotion that applies to a single cart line. */
export type Promotion =
  | { readonly id: string; readonly kind: "percentage"; readonly percent: number }
  | { readonly id: string; readonly kind: "buyTwoGetOne" }

/** The promotion that won on a line and how much it takes off. */
export interface LinePromotionResult {
  readonly promotionId: string
  readonly discount: Money
}

/** The most free units a single promotion grants on one line. */
const MAX_FREE_UNITS_PER_LINE = 2

/** The number of free units for `quantity` units: one per complete group of 3. */
function freeUnits(quantity: number): number {
  return Math.min(Math.floor(quantity / 3), MAX_FREE_UNITS_PER_LINE)
}

/**
 * Rule: buy two, get one free. Every complete group of 3 units charges 2, so
 * the free units are `floor(quantity / 3)` and the discount is that many unit
 * prices. 1 unit charges 1 (discount 0), 2 units charge 2, 3 units charge 2,
 * 5 units charge 4, 6 units charge 4. Quantity must be a positive integer.
 */
export function buyTwoGetOneDiscount(unitPrice: Money, quantity: number): Money {
  assertQuantity(quantity)
  return multiply(unitPrice, freeUnits(quantity))
}

/**
 * Rule: the discount one promotion gives on a line of `quantity` units at
 * `unitPrice`. A percentage promotion uses `percentageDiscount` on the line
 * subtotal (unit price times quantity); buy-two-get-one uses
 * `buyTwoGetOneDiscount`.
 */
export function promotionDiscount(promotion: Promotion, unitPrice: Money, quantity: number): Money {
  assertQuantity(quantity)
  const lineSubtotal = multiply(unitPrice, quantity)
  if (promotion.kind === "percentage") {
    assertPercent(promotion.percent)
    return percentageDiscount(lineSubtotal, promotion.percent)
  }
  return buyTwoGetOneDiscount(unitPrice, quantity)
}

/**
 * Rule: a line gets at most ONE promotion, the one giving the largest
 * discount. Promotions never add up on a line. When two give the same
 * discount the one listed first wins. Returns null when there are no
 * promotions or none gives a discount above 0.
 */
export function bestLinePromotion(
  promotions: readonly Promotion[],
  unitPrice: Money,
  quantity: number,
): LinePromotionResult | null {
  let best: LinePromotionResult | null = null
  for (const promotion of promotions) {
    const discount = promotionDiscount(promotion, unitPrice, quantity)
    if (discount > 0 && (best === null || discount > best.discount)) {
      best = { promotionId: promotion.id, discount }
    }
  }
  return best
}
