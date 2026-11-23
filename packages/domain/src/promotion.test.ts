import { describe, expect, test } from "bun:test"
import { money } from "./money.ts"
import {
  type Promotion,
  bestLinePromotion,
  buyTwoGetOneDiscount,
  promotionDiscount,
} from "./promotion.ts"

const price = money(1000)

describe("buyTwoGetOneDiscount", () => {
  test("3 units charge 2, 5 charge 4, 1 charges 1", () => {
    expect(buyTwoGetOneDiscount(price, 3)).toBe(1000 as never)
    expect(buyTwoGetOneDiscount(price, 5)).toBe(1000 as never)
    expect(buyTwoGetOneDiscount(price, 6)).toBe(2000 as never)
    expect(buyTwoGetOneDiscount(price, 1)).toBe(0 as never)
    expect(buyTwoGetOneDiscount(price, 2)).toBe(0 as never)
  })
  test("rejects quantity 0 and negatives", () => {
    expect(() => buyTwoGetOneDiscount(price, 0)).toThrow(RangeError)
    expect(() => buyTwoGetOneDiscount(price, -3)).toThrow(RangeError)
  })
})

describe("promotionDiscount", () => {
  test("a percentage applies to the line subtotal", () => {
    const p: Promotion = { id: "ten", kind: "percentage", percent: 10 }
    expect(promotionDiscount(p, money(1999), 1)).toBe(200 as never)
    expect(promotionDiscount(p, money(1000), 3)).toBe(300 as never)
  })
})

describe("bestLinePromotion", () => {
  const ten: Promotion = { id: "ten", kind: "percentage", percent: 10 }
  const half: Promotion = { id: "half", kind: "percentage", percent: 50 }
  const b2g1: Promotion = { id: "b2g1", kind: "buyTwoGetOne" }

  test("two promotions on one line: the larger one wins, they do not add", () => {
    expect(bestLinePromotion([ten, half], price, 1)).toEqual({
      promotionId: "half",
      discount: 500 as never,
    })
    expect(bestLinePromotion([half, ten], price, 1)?.promotionId).toBe("half")
  })
  test("buy-two-get-one beats 10% on 3 units (1000 vs 300)", () => {
    expect(bestLinePromotion([ten, b2g1], price, 3)?.promotionId).toBe("b2g1")
  })
  test("a tie goes to the first listed", () => {
    expect(
      bestLinePromotion([ten, { id: "ten2", kind: "percentage", percent: 10 }], price, 1)
        ?.promotionId,
    ).toBe("ten")
  })
  test("no promotion, or none that discounts, gives null", () => {
    expect(bestLinePromotion([], price, 1)).toBeNull()
    expect(bestLinePromotion([b2g1], price, 2)).toBeNull()
  })
})
