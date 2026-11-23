# Discounts

Four small rules, all pure functions in
[`discount.ts`](../../packages/domain/src/discount.ts), tested in
[`discount.test.ts`](../../packages/domain/src/discount.test.ts).

## Percentage discount

`percentageDiscount(amount, percent)` returns the amount taken off: `amount * percent / 100` rounded
to the nearest minor unit, an exact half rounded **up**. 10% off 1999 is 199.9, which rounds to 200
off, so the customer pays 1799. The percent is a whole number from 0 to 100 (0 takes nothing, 100
takes everything).

## Fixed discount

`fixedDiscount(amount, off)` returns `min(off, amount)`: 500 off, never more than the amount, so
the result never goes below 0.

## Spend threshold

`thresholdDiscount(subtotal)` returns 1000 when the subtotal is at least 10000 (exactly 10000
qualifies, 9999 does not), otherwise 0. The subtotal is the one **after line discounts and before the
coupon** (see [stacking](stacking.md)).

## Floor

`floorAtZero` and `applyDiscount`: a total never goes below 0.
