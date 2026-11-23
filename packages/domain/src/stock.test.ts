import { describe, expect, test } from "bun:test"
import { nextRedemptionCount, nextStock } from "./stock.ts"

describe("nextStock", () => {
  test("subtracts the quantity", () => {
    expect(nextStock(10, 3)).toEqual({ ok: true, value: 7 })
  })
  test("selling exactly the stock leaves 0", () => {
    expect(nextStock(3, 3)).toEqual({ ok: true, value: 0 })
  })
  test("rejects when stock would go negative", () => {
    expect(nextStock(2, 3)).toEqual({ ok: false, reason: "insufficient_stock" })
  })
  test("rejects bad inputs", () => {
    expect(() => nextStock(-1, 1)).toThrow(RangeError)
    expect(() => nextStock(5, 0)).toThrow(RangeError)
  })
})

describe("nextRedemptionCount", () => {
  test("adds one below the limit", () => {
    expect(nextRedemptionCount(0, 3)).toEqual({ ok: true, value: 1 })
    expect(nextRedemptionCount(2, 3)).toEqual({ ok: true, value: 3 })
  })
  test("rejects at the limit", () => {
    expect(nextRedemptionCount(3, 3)).toEqual({ ok: false, reason: "exhausted" })
  })
})
