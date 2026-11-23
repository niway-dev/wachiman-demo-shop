import type { Money } from "./money.ts"

/**
 * A product in the catalog. `price` is the unit price in minor units and
 * `stock` is the number of units on hand, a whole number that is never
 * negative.
 */
export interface Product {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly price: Money
  readonly stock: number
}
