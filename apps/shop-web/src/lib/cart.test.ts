import { describe, expect, test } from "bun:test"
import { MAX_QUANTITY, addItem, itemCount, parseCart, removeItem, setQuantity } from "./cart.ts"

describe("cart list operations", () => {
  test("adding the same product twice merges the lines", () => {
    const items = addItem(addItem([], "pen"), "pen", 2)
    expect(items).toEqual([{ productId: "pen", quantity: 3 }])
  })

  test("setting a quantity below 1 removes the line", () => {
    const items = setQuantity([{ productId: "pen", quantity: 2 }], "pen", 0)
    expect(items).toEqual([])
  })

  test("setting a quantity keeps the line position", () => {
    const items = setQuantity(
      [
        { productId: "pen", quantity: 1 },
        { productId: "mug", quantity: 1 },
      ],
      "pen",
      5,
    )
    expect(items.map((i) => i.productId)).toEqual(["pen", "mug"])
    expect(items[0]?.quantity).toBe(5)
  })

  test("a quantity is capped", () => {
    expect(setQuantity([], "pen", 100_000)[0]?.quantity).toBe(MAX_QUANTITY)
  })

  test("the badge counts units, not products", () => {
    const items = [
      { productId: "pen", quantity: 3 },
      { productId: "mug", quantity: 2 },
    ]
    expect(itemCount(items)).toBe(5)
    expect(itemCount(removeItem(items, "pen"))).toBe(2)
  })
})

describe("parseCart", () => {
  test("drops invalid entries and survives bad JSON", () => {
    const raw = JSON.stringify([
      { productId: "pen", quantity: 2 },
      { productId: "mug", quantity: -1 },
      { productId: 7, quantity: 1 },
      null,
    ])
    expect(parseCart(raw)).toEqual([{ productId: "pen", quantity: 2 }])
    expect(parseCart("not json")).toEqual([])
    expect(parseCart(null)).toEqual([])
  })
})
