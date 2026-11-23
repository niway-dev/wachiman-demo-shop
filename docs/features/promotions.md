# Line promotions

A promotion applies to one cart line. Code:
[`promotion.ts`](../../packages/domain/src/promotion.ts); tests:
[`promotion.test.ts`](../../packages/domain/src/promotion.test.ts). Quantities are validated in
[`cart.ts`](../../packages/domain/src/cart.ts) ([tests](../../packages/domain/src/cart.test.ts)): a
quantity is a positive integer, so 0 and negatives throw a `RangeError`.

## Kinds

- **Percentage**: the [percentage discount](discounts.md) on the line subtotal (unit price times
  quantity).
- **Buy two, get one**: every complete group of 3 units charges 2. Free units are
  `floor(quantity / 3)`. 1 unit charges 1, 3 units charge 2, 5 units charge 4.

## Which one wins

`bestLinePromotion` applies exactly one promotion per line: the one with the largest discount.
Promotions never add up on a line. A tie goes to the promotion listed first. It returns null when
nothing discounts the line.
