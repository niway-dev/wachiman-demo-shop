import { expect, test } from "bun:test"

// The result must not depend on the machine's time zone, so the test sets it
// before the code under test runs and checks one zone west and one east of UTC.
const ZONES = ["America/Los_Angeles", "Pacific/Auckland"]

test("a date-only coupon is valid until its UTC midnight in any time zone", async () => {
  const { validateCoupon } = await import("../packages/domain/src/index.ts")
  const expiresAt = Date.UTC(2026, 2, 10)
  const coupon = {
    code: "SPRING",
    discount: { kind: "percentage", percent: 10 },
    usageLimit: 5,
    expiresAt,
  } as const
  for (const zone of ZONES) {
    process.env.TZ = zone
    expect(validateCoupon(coupon, { redemptions: 0, now: expiresAt - 3_600_000 }).ok).toBe(true)
    expect(validateCoupon(coupon, { redemptions: 0, now: expiresAt }).ok).toBe(false)
  }
})
