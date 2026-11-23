import {
  type CouponChanges,
  type CouponRecord,
  CouponRepository,
  RepositoryError,
} from "@demo-shop/application"
import { money } from "@demo-shop/domain"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { ShopDatabase } from "./database.ts"
import { coupons } from "./schema.ts"

type Row = typeof coupons.$inferSelect

/** Maps a row to the domain coupon plus its admin fields. */
export function toCouponRecord(row: Row): CouponRecord {
  return {
    code: row.code,
    discount:
      row.discountKind === "percentage"
        ? { kind: "percentage", percent: row.percent ?? 0 }
        : { kind: "fixed", amount: money(row.amountMinor ?? 0) },
    usageLimit: row.usageLimit,
    expiresAt: row.expiresAt.getTime(),
    active: row.active,
    redemptions: row.redemptions,
  }
}

/** The discount columns for a domain discount. */
function discountColumns(discount: CouponRecord["discount"]) {
  return discount.kind === "percentage"
    ? { discountKind: "percentage" as const, percent: discount.percent, amountMinor: null }
    : { discountKind: "fixed" as const, percent: null, amountMinor: discount.amount as number }
}

/** Repository implementation: the `CouponRepository` port over drizzle and SQLite. */
export const CouponRepositoryLive = (db: ShopDatabase) => {
  const find = (code: string) => {
    const row = db.select().from(coupons).where(eq(coupons.code, code)).get()
    return row === undefined ? undefined : toCouponRecord(row)
  }
  return Layer.succeed(CouponRepository, {
    list: () =>
      Effect.try({
        try: () =>
          db
            .select()
            .from(coupons)
            .orderBy(coupons.createdAt, coupons.code)
            .all()
            .map(toCouponRecord),
        catch: (cause) => new RepositoryError({ cause }),
      }),
    find: (code) =>
      Effect.try({ try: () => find(code), catch: (cause) => new RepositoryError({ cause }) }),
    create: (record) =>
      Effect.try({
        try: () => {
          db.insert(coupons)
            .values({
              code: record.code,
              ...discountColumns(record.discount),
              usageLimit: record.usageLimit,
              expiresAt: new Date(record.expiresAt),
              active: record.active,
              redemptions: record.redemptions,
              createdAt: new Date(),
            })
            .run()
        },
        catch: (cause) => new RepositoryError({ cause }),
      }),
    update: (code, changes: CouponChanges) =>
      Effect.try({
        try: () => {
          const set = {
            ...(changes.discount === undefined ? {} : discountColumns(changes.discount)),
            ...(changes.usageLimit === undefined ? {} : { usageLimit: changes.usageLimit }),
            ...(changes.expiresAt === undefined ? {} : { expiresAt: new Date(changes.expiresAt) }),
            ...(changes.active === undefined ? {} : { active: changes.active }),
          }
          if (Object.keys(set).length > 0)
            db.update(coupons).set(set).where(eq(coupons.code, code)).run()
          return find(code)
        },
        catch: (cause) => new RepositoryError({ cause }),
      }),
  })
}
