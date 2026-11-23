import { Effect } from "effect"
import { CouponRepository, OrderRepository, PromotionRepository } from "./ports.ts"
import { listProducts } from "./products.ts"
import { requireAdmin } from "./session.ts"

/**
 * Use case (admin): the shop's counters. Units in stock per product, the
 * number of stored orders, and the redemptions per promotion and per coupon.
 */
export const getCounters = (headers: Headers) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const products = yield* listProducts()
    const promotions = yield* (yield* PromotionRepository).list()
    const coupons = yield* (yield* CouponRepository).list()
    const orders = yield* (yield* OrderRepository).count()
    return {
      stock: products.map((p) => ({ productId: p.id, name: p.name, stock: p.stock })),
      orders,
      promotions: promotions.map((p) => ({ id: p.id, name: p.name, redemptions: p.redemptions })),
      coupons: coupons.map((c) => ({ code: c.code, redemptions: c.redemptions })),
    }
  })
