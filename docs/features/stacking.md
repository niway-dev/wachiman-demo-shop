# Stacking and the cart total

`priceCart(cart, promotions, coupon, now)` in
[`pricing.ts`](../../packages/domain/src/pricing.ts) is the single place a total is computed. Tests:
[`pricing.test.ts`](../../packages/domain/src/pricing.test.ts).

## Order

1. **Line promotion**: per line, only the single best [promotion](promotions.md).
2. **Coupon**: at most one [coupon](coupons.md), taken off the subtotal after line discounts. An
   invalid coupon takes off 0 and the reason is returned in `couponRejection`.
3. **Spend threshold**: 1000 off when the subtotal after line discounts is at least 10000. The
   coupon does **not** reduce the amount the threshold looks at.
4. **Floor**: `total = max(0, discountedSubtotal - couponDiscount - thresholdDiscount)`.

## Breakdown

The result holds, per line, the subtotal, the discount and the winning `promotionId`; and for the
cart the subtotal, `lineDiscountTotal`, `discountedSubtotal`, `couponDiscount`, `couponRejection`,
`thresholdDiscount` and `total`. An empty cart totals 0; a line with a quantity of 0 or less throws.

## Example (illustrative)

One line, 2 x 6000, with a 10% promotion and a 500 fixed coupon: subtotal 12000, line discount
1200, discounted subtotal 10800, coupon 500, threshold 1000, total 9300.
