import { type Money, multiply } from "../money.ts"

/** One line of a cart: a product at a unit price and a quantity. */
export interface CartLine {
  readonly productId: string
  readonly unitPrice: Money
  readonly quantity: number
}

export interface Cart {
  readonly lines: readonly CartLine[]
}

/** Rule: a quantity is a positive whole number; 0, negatives and fractions throw a RangeError. */
export function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Quantity must be a positive integer, got ${quantity}`)
  }
}

/**
 * Rule: a line's subtotal is its unit price times its quantity, before any
 * discount. Throws a RangeError when the quantity is not a positive integer.
 */
export function lineSubtotal(line: CartLine): Money {
  assertQuantity(line.quantity)
  return multiply(line.unitPrice, line.quantity)
}
