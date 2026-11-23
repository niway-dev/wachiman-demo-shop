import type { CouponDiscount } from "@demo-shop/domain"
import { Effect } from "effect"
import { AlreadyExists, NotFound } from "./errors.ts"
import { CouponRepository } from "./ports.ts"
import { requireAdmin } from "./session.ts"

/** The editable part of a coupon. */
export interface CouponInput {
  readonly discount: CouponDiscount
  readonly usageLimit: number
  /** Milliseconds since the epoch; see `validateCoupon` for the exclusive expiry rule. */
  readonly expiresAt: number
}

/** Use case (admin): every coupon with its switch and its redemption count. */
export const listCoupons = (headers: Headers) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    return yield* (yield* CouponRepository).list()
  })

/**
 * Use case (admin): creates a coupon. Codes are stored upper-case, so `save10`
 * and `SAVE10` are the same coupon; a taken code fails with `AlreadyExists`.
 */
export const createCoupon = (
  headers: Headers,
  input: CouponInput & { readonly code: string; readonly active: boolean },
) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const repository = yield* CouponRepository
    const code = input.code.trim().toUpperCase()
    if ((yield* repository.find(code)) !== undefined) {
      return yield* new AlreadyExists({ kind: "coupon", id: code })
    }
    const record = { ...input, code, redemptions: 0 }
    yield* repository.create(record)
    return record
  })

/** Use case (admin): changes a coupon's discount, limit or expiry. Fails with `NotFound`. */
export const updateCoupon = (headers: Headers, code: string, input: CouponInput) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const updated = yield* (yield* CouponRepository).update(code.trim().toUpperCase(), input)
    if (updated === undefined) return yield* new NotFound({ kind: "coupon", id: code })
    return updated
  })

/** Use case (admin): switches a coupon on or off. A coupon that is off behaves as not found. */
export const setCouponActive = (headers: Headers, code: string, active: boolean) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const updated = yield* (yield* CouponRepository).update(code.trim().toUpperCase(), { active })
    if (updated === undefined) return yield* new NotFound({ kind: "coupon", id: code })
    return updated
  })
