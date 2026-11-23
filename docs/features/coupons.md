# Coupons

A coupon has a discount (a percentage or a fixed amount), a usage limit and an expiry instant. Code:
[`coupon.ts`](../../packages/domain/src/coupon.ts); tests:
[`coupon.test.ts`](../../packages/domain/src/coupon.test.ts).

`validateCoupon(coupon, { redemptions, now, orderHasCoupon })` returns `{ ok: true, coupon }` or
`{ ok: false, reason }`. Checks run in this order and the first failure is the reason:

1. `not_found`: there is no such coupon.
2. `already_applied`: the order already carries a coupon (at most one per order).
3. `expired`: `now >= expiresAt`. Expiry is **exclusive**: at exactly `expiresAt` the coupon is
   expired, one millisecond earlier it is valid.
4. `exhausted`: `redemptions >= usageLimit`. A coupon with limit 3 works while the count is 0, 1 or
   2 and is exhausted at 3.

`couponDiscount(discount, base)` takes the coupon off the cart subtotal after line discounts. A
fixed coupon never takes more than the base; a percentage coupon uses the
[percentage rounding rule](discounts.md).
