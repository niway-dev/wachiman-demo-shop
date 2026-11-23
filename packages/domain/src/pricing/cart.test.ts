import { describe, expect, test } from "bun:test"
import { assertQuantity, lineSubtotal } from "./cart.ts"
import { money } from "../money.ts"

describe("cart", () => {
  test("line subtotal is unit price times quantity", () => {
    expect(lineSubtotal({ productId: "a", unitPrice: money(1999), quantity: 3 })).toBe(
      5997 as never,
    )
  })
  test("quantity 0, negative or fractional is rejected", () => {
    for (const q of [0, -1, 1.5, Number.NaN]) expect(() => assertQuantity(q)).toThrow(RangeError)
    expect(() => lineSubtotal({ productId: "a", unitPrice: money(100), quantity: 0 })).toThrow(
      RangeError,
    )
  })
})
