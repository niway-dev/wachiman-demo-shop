import {
  type PromotionChanges,
  type PromotionRecord,
  PromotionRepository,
  RepositoryError,
} from "@demo-shop/application"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { ShopDatabase } from "./database.ts"
import { promotions } from "./schema.ts"

type Row = typeof promotions.$inferSelect

/** Maps a row to the domain promotion plus its admin fields. */
export function toPromotionRecord(row: Row): PromotionRecord {
  const shared = { id: row.id, name: row.name, active: row.active, redemptions: row.redemptions }
  return row.kind === "percentage"
    ? { ...shared, kind: "percentage", percent: row.percent ?? 0 }
    : { ...shared, kind: "buyTwoGetOne" }
}

/** Repository implementation: the `PromotionRepository` port over drizzle and SQLite. */
export const PromotionRepositoryLive = (db: ShopDatabase) =>
  Layer.succeed(PromotionRepository, {
    list: () =>
      Effect.try({
        try: () =>
          db
            .select()
            .from(promotions)
            .orderBy(promotions.createdAt, promotions.id)
            .all()
            .map(toPromotionRecord),
        catch: (cause) => new RepositoryError({ cause }),
      }),
    create: (record) =>
      Effect.try({
        try: () => {
          db.insert(promotions)
            .values({
              id: record.id,
              name: record.name,
              kind: record.kind,
              percent: record.kind === "percentage" ? record.percent : null,
              active: record.active,
              redemptions: record.redemptions,
              createdAt: new Date(),
            })
            .run()
        },
        catch: (cause) => new RepositoryError({ cause }),
      }),
    update: (id, changes: PromotionChanges) =>
      Effect.try({
        try: () => {
          const set = {
            ...(changes.name === undefined ? {} : { name: changes.name }),
            ...(changes.active === undefined ? {} : { active: changes.active }),
            ...(changes.rule === undefined
              ? {}
              : {
                  kind: changes.rule.kind,
                  percent: changes.rule.kind === "percentage" ? changes.rule.percent : null,
                }),
          }
          if (Object.keys(set).length > 0)
            db.update(promotions).set(set).where(eq(promotions.id, id)).run()
          const row = db.select().from(promotions).where(eq(promotions.id, id)).get()
          return row === undefined ? undefined : toPromotionRecord(row)
        },
        catch: (cause) => new RepositoryError({ cause }),
      }),
  })
