import { describe, expect, test } from "bun:test"
import { ZERO, add, formatMoney, money, multiply, subtract } from "./money.ts"

describe("money", () => {
  test("accepts whole minor units", () => {
    expect(money(1999)).toBe(1999 as never)
  })

  test("rejects fractions, NaN and Infinity", () => {
    expect(() => money(19.99)).toThrow(RangeError)
    expect(() => money(Number.NaN)).toThrow(RangeError)
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  test("add and subtract are exact", () => {
    expect(add(money(1999), money(1))).toBe(2000 as never)
    expect(subtract(money(500), money(700))).toBe(-200 as never)
    expect(add(ZERO, ZERO)).toBe(0 as never)
  })

  test("multiply by an integer quantity is exact", () => {
    expect(multiply(money(1999), 3)).toBe(5997 as never)
  })

  test("multiply by a rate rounds half away from zero", () => {
    expect(multiply(money(1999), 0.9)).toBe(1799 as never)
    expect(multiply(money(201), 0.5)).toBe(101 as never)
    expect(multiply(money(-201), 0.5)).toBe(-101 as never)
    expect(multiply(money(1), 0.4)).toBe(0 as never)
  })

  test("multiply never returns a negative zero", () => {
    expect(Object.is(multiply(money(-1), 0.1), 0)).toBe(true)
  })

  test("multiply rejects a non finite factor", () => {
    expect(() => multiply(money(100), Number.NaN)).toThrow(RangeError)
  })

  test("formatMoney prints two fraction digits", () => {
    expect(formatMoney(money(1999))).toBe("19.99")
    expect(formatMoney(money(5))).toBe("0.05")
    expect(formatMoney(money(-250))).toBe("-2.50")
    expect(formatMoney(ZERO)).toBe("0.00")
  })
})
