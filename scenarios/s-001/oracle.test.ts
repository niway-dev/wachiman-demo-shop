import { expect, test } from "bun:test"
import { SPEND_THRESHOLD_DISCOUNT, money, thresholdDiscount } from "../packages/domain/src/index.ts"

test("a subtotal of exactly 10000 gets the spend discount", () => {
  expect(thresholdDiscount(money(10000))).toBe(SPEND_THRESHOLD_DISCOUNT)
})

test("a subtotal of 9999 gets nothing", () => {
  expect(thresholdDiscount(money(9999))).toBe(money(0))
})
