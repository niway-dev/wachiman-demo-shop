import { expect, test } from "bun:test"
import { buyTwoGetOneDiscount, money } from "../packages/domain/src/index.ts"

test("9 units at buy-two-get-one give 3 free units", () => {
  expect(buyTwoGetOneDiscount(money(1000), 9)).toBe(money(3000))
})

test("6 units give 2 free units", () => {
  expect(buyTwoGetOneDiscount(money(1000), 6)).toBe(money(2000))
})
