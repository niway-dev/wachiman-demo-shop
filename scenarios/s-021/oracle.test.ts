import { expect, test } from "bun:test"
import { nextRedemptionCount } from "../packages/domain/src/index.ts"

test("a coupon at its usage limit cannot be redeemed again", () => {
  expect(nextRedemptionCount(3, 3)).toEqual({ ok: false, reason: "exhausted" })
})
