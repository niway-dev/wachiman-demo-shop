import { ProductRepository, RepositoryError } from "@demo-shop/application"
import { type Product, money } from "@demo-shop/domain"
import { Effect, Layer } from "effect"
import type { ShopDatabase } from "./database.ts"
import { products } from "./schema.ts"

/** Repository implementation: the `ProductRepository` port over drizzle and SQLite. */
export const ProductRepositoryLive = (db: ShopDatabase) =>
  Layer.succeed(ProductRepository, {
    list: () =>
      Effect.try({
        try: (): readonly Product[] =>
          db
            .select()
            .from(products)
            .all()
            .map((row) => ({
              id: row.id,
              name: row.name,
              description: row.description,
              price: money(row.priceMinor),
              stock: row.stock,
            })),
        catch: (cause) => new RepositoryError({ cause }),
      }),
  })
