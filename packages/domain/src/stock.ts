export type CounterResult<R extends string> =
  { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: R }

/**
 * Rule: the stock after a checkout is `stock - quantity`. When that would be
 * negative the result is `{ ok: false, reason: "insufficient_stock" }` and
 * nothing changes; selling exactly the stock on hand (result 0) is allowed.
 * Throws a RangeError when `stock` is negative or `quantity` is not a
 * positive integer. The caller stores the new stock only together with the
 * order.
 */
export function nextStock(stock: number, quantity: number): CounterResult<"insufficient_stock"> {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new RangeError(`Stock must be a non-negative integer, got ${stock}`)
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Quantity must be a positive integer, got ${quantity}`)
  }
  return stock - quantity < 0
    ? { ok: false, reason: "insufficient_stock" }
    : { ok: true, value: stock - quantity }
}

/**
 * Rule: the redemption count after one more redemption is `redemptions + 1`,
 * unless the coupon is already at its limit (`redemptions >= usageLimit`), in
 * which case the result is `{ ok: false, reason: "exhausted" }`.
 *
 * A redemption counts only AFTER the order is stored. This function only
 * computes the next number; the CALLER must save it in the same transaction as
 * the order, and must not call it (or save its result) for an order that
 * failed or was not stored. Pricing with a coupon never counts a redemption.
 */
export function nextRedemptionCount(
  redemptions: number,
  usageLimit: number,
): CounterResult<"exhausted"> {
  if (!Number.isInteger(redemptions) || redemptions < 0) {
    throw new RangeError(`Redemptions must be a non-negative integer, got ${redemptions}`)
  }
  return redemptions >= usageLimit
    ? { ok: false, reason: "exhausted" }
    : { ok: true, value: redemptions + 1 }
}
