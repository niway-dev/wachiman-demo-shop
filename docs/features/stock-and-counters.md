# Stock and counters

Pure functions in [`stock.ts`](../../packages/domain/src/stock.ts), tested in
[`stock.test.ts`](../../packages/domain/src/stock.test.ts).

- `nextStock(stock, quantity)` returns the stock after checkout. It rejects with
  `insufficient_stock` when the result would be negative; selling exactly the stock leaves 0.
- `nextRedemptionCount(redemptions, usageLimit)` returns the count plus one, or rejects with
  `exhausted` when the coupon is already at its limit.

**A redemption counts only after the order is stored.** These functions only compute the next
number. The caller saves it in the same transaction as the order, and never for an order that
failed. Pricing a cart with a coupon never counts a redemption.
