import type { Product } from "@demo-shop/domain"
import { Effect } from "effect"
import { ProductRepository } from "./ports.ts"

/**
 * Use case: the public catalog, sorted by name (case-insensitive, then by id so
 * the order is always the same). Needs no session.
 */
export const listProducts = () =>
  Effect.gen(function* () {
    const repository = yield* ProductRepository
    const products = yield* repository.list()
    return sortByName(products)
  })

function sortByName(products: readonly Product[]): readonly Product[] {
  return [...products].sort(
    (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id),
  )
}
