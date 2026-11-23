# Cart and checkout

A customer browses the catalog, fills a cart, logs in, applies at most one coupon and checks out.
An admin manages promotions and coupons and reads the counters. This page is the flow end to end.

## The cart is on the client; the server prices it

The cart lives in the browser's `localStorage` and holds only product ids and quantities
([`cart.ts`](../../apps/shop-web/src/lib/cart.ts), [tests](../../apps/shop-web/src/lib/cart.test.ts)).
The badge in the nav is the number of units in it. The web app sends **product ids, quantities and
a coupon code** and nothing else: the contract ([`CartInputSchema`](../../packages/api-contract/src/index.ts))
has no price or total field, and zod drops unknown keys, so a tampered `priceMinor` or `totalMinor`
never reaches the use case.

`cart.quote` (public) prices a cart for display. `cart.checkout` (needs a session, 401 otherwise)
places the order. Both go through the same `priceOrder` step, so a quote shows what checkout will
charge.

## Where totals are computed

**Only in `priceCart`** ([`pricing.ts`](../../packages/domain/src/pricing.ts), see
[stacking](stacking.md)). `priceOrder` in [`checkout.ts`](../../packages/application/src/checkout.ts)
reads the unit prices from the products table, the active promotions and the coupon by code, builds a
domain `Cart` and calls `priceCart`. It does no arithmetic of its own; the api handler
([`router.ts`](../../apps/shop-api/src/router.ts), [`dto.ts`](../../apps/shop-api/src/dto.ts)) only
copies the result into the response.

## One transaction

`checkout` runs inside `CheckoutStore.transaction`, which the SQLite adapter
([`checkout-store.ts`](../../packages/infra-db/src/checkout-store.ts)) implements as one
`BEGIN IMMEDIATE ... COMMIT`. In order:

1. Price the cart (`priceCart`). A coupon the domain rejects (`not_found`, `expired`, `exhausted`;
   `already_applied` cannot occur here, as an order carries one coupon) fails the checkout with `CouponRejected` (HTTP 422). A coupon the admin
   switched off counts as `not_found`.
2. For each line, `nextStock(stock, quantity)` from [`stock.ts`](../../packages/domain/src/stock.ts).
   A result that would be negative fails with `InsufficientStock` (HTTP 409, with the product and
   the units left). Selling exactly the stock is allowed.
3. Store the order and its lines with the unit price and discount each was charged.
4. **Only now** count the redemptions ([stock and counters](stock-and-counters.md)): the coupon's
   next count comes from `nextRedemptionCount`, and each promotion that discounted a line gets +1.

Any failure rolls back every write, so a failed checkout leaves stock, orders and counters as they
were. The write lock is taken before the first read, so two checkouts cannot both take the last
unit or the last coupon redemption.

## Admin

Every `admin.*` procedure calls `requireAdmin` in `application`
([`session.ts`](../../packages/application/src/session.ts)): 401 without a session, 403 for a
customer. The admin page hides nothing that the api would allow.

- Promotions: create, edit, switch on or off
  ([`promotions.ts`](../../packages/application/src/promotions.ts)). Checkout sees only the ones
  that are on. The domain has percentage and buy-two-get-one promotions; a fixed amount off is a
  coupon.
- Coupons: create (codes are stored upper-case), edit, switch on or off
  ([`coupons.ts`](../../packages/application/src/coupons.ts)).
- Counters ([`counters.ts`](../../packages/application/src/counters.ts)): units in stock per
  product, number of orders, redemptions per promotion (stored orders it discounted a line of) and
  per coupon (compared with its usage limit).

## Data

Migration [`0001_carts.sql`](../../packages/infra-db/drizzle/0001_carts.sql) adds `promotions`,
`coupons`, `orders` and `order_lines`. `bun run db:reset` seeds three promotions (10% on, buy-two-
get-one on, 25% off), the coupons `WELCOME5` (5.00 off, valid until 2099) and `SAVE15` (expired in
2020). The spend threshold is a rule inside `priceCart`, so it needs no row.

## Tests

- Use cases with in-memory ports:
  [`checkout.test.ts`](../../packages/application/src/checkout.test.ts),
  [`admin.test.ts`](../../packages/application/src/admin.test.ts).
- The real transaction and its rollback on SQLite:
  [`infra-db.test.ts`](../../packages/infra-db/src/infra-db.test.ts).
- Over HTTP with `getTestApp()`: [`checkout.test.ts`](../../apps/shop-api/src/checkout.test.ts) (happy
  path, tampered total, out of stock, expired and exhausted coupons, 401) and
  [`admin.test.ts`](../../apps/shop-api/src/admin.test.ts) (customer 403, admin 200, counters).
  The tampered-total test is named `AC9: a tampered price or total is ignored; the stored total is
the domain total`.
