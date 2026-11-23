import {
  CheckoutStore,
  type CheckoutReader,
  type CheckoutTransaction,
  RepositoryError,
} from "@demo-shop/application"
import { type Product, money } from "@demo-shop/domain"
import { eq, inArray, sql } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import type { DatabaseHandle } from "./database.ts"
import { toCouponRecord } from "./coupon-repository.ts"
import { toPromotionRecord } from "./promotion-repository.ts"
import { coupons, orderLines, orders, products, promotions } from "./schema.ts"

/** Wraps a synchronous driver call so a throw becomes a `RepositoryError`. */
const attempt = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => new RepositoryError({ cause }) })

/** Thrown inside the SQLite transaction to roll it back, carrying why. */
class Rollback extends Error {
  constructor(readonly reason: Cause.Cause<unknown>) {
    super("rollback")
  }
}

/**
 * Repository implementation: the `CheckoutStore` port over bun:sqlite.
 *
 * `transaction` is ONE SQLite transaction (`BEGIN IMMEDIATE ... COMMIT`): the
 * write lock is taken before the first read, so the stock and coupon counts a
 * checkout reads cannot change under it. The body is run to completion
 * synchronously inside the transaction (its steps are plain driver calls), so
 * no other request can interleave on the same connection. A failed body
 * throws `Rollback` and SQLite undoes every write.
 */
export const CheckoutStoreLive = ({ sqlite, db }: DatabaseHandle) => {
  const reader: CheckoutReader = {
    products: (ids) =>
      attempt(() =>
        ids.length === 0
          ? []
          : db
              .select()
              .from(products)
              .where(inArray(products.id, [...ids]))
              .all()
              .map((row): Product => ({
                id: row.id,
                name: row.name,
                description: row.description,
                price: money(row.priceMinor),
                stock: row.stock,
              })),
      ),
    activePromotions: () =>
      attempt(() =>
        db
          .select()
          .from(promotions)
          .where(eq(promotions.active, true))
          .orderBy(promotions.createdAt, promotions.id)
          .all()
          .map(toPromotionRecord),
      ),
    coupon: (code) =>
      attempt(() => {
        const row = db.select().from(coupons).where(eq(coupons.code, code)).get()
        return row === undefined ? undefined : toCouponRecord(row)
      }),
  }

  const tx: CheckoutTransaction = {
    ...reader,
    saveStock: (productId, stock) =>
      attempt(() => {
        db.update(products).set({ stock }).where(eq(products.id, productId)).run()
      }),
    saveOrder: (order) =>
      attempt(() => {
        db.insert(orders)
          .values({
            id: order.id,
            userId: order.userId,
            subtotalMinor: order.subtotal,
            discountMinor: order.discount,
            totalMinor: order.total,
            couponCode: order.couponCode,
            createdAt: new Date(order.createdAt),
          })
          .run()
        db.insert(orderLines)
          .values(
            order.lines.map((line) => ({
              orderId: order.id,
              productId: line.productId,
              quantity: line.quantity,
              unitPriceMinor: line.unitPrice,
              discountMinor: line.discount,
              promotionId: line.promotionId,
            })),
          )
          .run()
      }),
    saveCouponRedemptions: (code, redemptions) =>
      attempt(() => {
        db.update(coupons).set({ redemptions }).where(eq(coupons.code, code)).run()
      }),
    countPromotionRedemptions: (ids) =>
      attempt(() => {
        if (ids.length === 0) return
        db.update(promotions)
          .set({ redemptions: sql`${promotions.redemptions} + 1` })
          .where(inArray(promotions.id, [...ids]))
          .run()
      }),
  }

  return Layer.succeed(CheckoutStore, {
    reader,
    transaction: (body) =>
      Effect.suspend(() => {
        try {
          const run = sqlite.transaction(() => {
            const exit = Effect.runSyncExit(body(tx))
            if (Exit.isFailure(exit)) throw new Rollback(exit.cause)
            return exit.value
          })
          return Effect.succeed(run.immediate())
        } catch (error) {
          if (error instanceof Rollback) return Effect.failCause(error.reason as Cause.Cause<never>)
          return Effect.fail(new RepositoryError({ cause: error }))
        }
      }),
  })
}
