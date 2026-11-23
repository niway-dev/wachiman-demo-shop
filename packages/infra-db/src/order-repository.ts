import { OrderRepository, RepositoryError } from "@demo-shop/application"
import { count } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { ShopDatabase } from "./database.ts"
import { orders } from "./schema.ts"

/** Repository implementation: the `OrderRepository` port over drizzle and SQLite. */
export const OrderRepositoryLive = (db: ShopDatabase) =>
  Layer.succeed(OrderRepository, {
    count: () =>
      Effect.try({
        try: () => db.select({ value: count() }).from(orders).get()?.value ?? 0,
        catch: (cause) => new RepositoryError({ cause }),
      }),
  })
