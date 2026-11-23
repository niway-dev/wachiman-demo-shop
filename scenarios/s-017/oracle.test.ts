import { expect, test } from "bun:test"
import { money, percentageDiscount } from "../packages/domain/src/index.ts"

test("an exact half in a percentage discount rounds up", () => {
  // 10% of 1985 is 198.5: half up gives 199 (half to even would give 198).
  expect(percentageDiscount(money(1985), 10)).toBe(money(199))
  // 10% of 1995 is 199.5: both rules give 200.
  expect(percentageDiscount(money(1995), 10)).toBe(money(200))
})
