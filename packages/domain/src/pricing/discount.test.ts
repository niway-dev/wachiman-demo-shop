import { describe, expect, test } from "bun:test"
import {
  applyDiscount,
  fixedDiscount,
  floorAtZero,
  percentageDiscount,
  thresholdDiscount,
} from "./discount.ts"
import { money } from "../money.ts"

const m = money

describe("percentageDiscount", () => {
  test("10% off 1999 takes 200 off, so the customer pays 1799", () => {
    const off = percentageDiscount(m(1999), 10)
    expect(off).toBe(200 as never)
    expect(1999 - off).toBe(1799)
  })
  test("an exact half rounds up", () => {
    expect(percentageDiscount(m(1995), 10)).toBe(200 as never)
    expect(percentageDiscount(m(1994), 10)).toBe(199 as never)
  })
  test("0% takes nothing and 100% takes everything", () => {
    expect(percentageDiscount(m(1999), 0)).toBe(0 as never)
    expect(percentageDiscount(m(1999), 100)).toBe(1999 as never)
  })
  test("rejects a bad percent or a negative amount", () => {
    expect(() => percentageDiscount(m(100), -1)).toThrow(RangeError)
    expect(() => percentageDiscount(m(100), 101)).toThrow(RangeError)
    expect(() => percentageDiscount(m(100), 12.5)).toThrow(RangeError)
    expect(() => percentageDiscount(m(-100), 10)).toThrow(RangeError)
  })
})

describe("fixedDiscount", () => {
  test("500 off 1999 is 500", () => {
    expect(fixedDiscount(m(1999), m(500))).toBe(500 as never)
  })
  test("never more than the amount", () => {
    expect(fixedDiscount(m(300), m(500))).toBe(300 as never)
    expect(applyDiscount(m(300), fixedDiscount(m(300), m(500)))).toBe(0 as never)
  })
})

describe("thresholdDiscount", () => {
  test("exactly 10000 qualifies, 9999 does not", () => {
    expect(thresholdDiscount(m(10000))).toBe(1000 as never)
    expect(thresholdDiscount(m(9999))).toBe(0 as never)
    expect(thresholdDiscount(m(0))).toBe(0 as never)
  })
})

describe("floor", () => {
  test("a total never goes below 0", () => {
    expect(floorAtZero(m(-5))).toBe(0 as never)
    expect(floorAtZero(m(5))).toBe(5 as never)
    expect(applyDiscount(m(100), m(250))).toBe(0 as never)
  })
})
