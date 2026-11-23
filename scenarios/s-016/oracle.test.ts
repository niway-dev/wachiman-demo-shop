import { expect, test } from "bun:test"
import { bestLinePromotion, money } from "../packages/domain/src/index.ts"

test("when two promotions give the same discount, the one listed first wins", () => {
  const first = { id: "first", kind: "percentage", percent: 10 } as const
  const second = { id: "second", kind: "percentage", percent: 10 } as const
  expect(bestLinePromotion([first, second], money(1000), 1)?.promotionId).toBe("first")
})
