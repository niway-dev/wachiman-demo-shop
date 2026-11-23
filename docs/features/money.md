# Money

Money is an integer count of minor units: 1999 is 19.99. No floating point number represents an
amount in the domain. A value that is not a safe integer throws a `RangeError` where it is created.

- Code: [`money.ts`](../../packages/domain/src/money.ts)
- Tests: [`money.test.ts`](../../packages/domain/src/money.test.ts)

Percentages are whole numbers from 0 to 100, so discount arithmetic stays in integers (see
[discounts](discounts.md)).
