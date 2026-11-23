import { type Product, type Role, money } from "@demo-shop/domain"
import { Effect, Layer } from "effect"
import { ProductRepository, type Session, SessionReader } from "./ports.ts"

/** In-memory catalog for tests. */
export const productRepositoryInMemory = (products: readonly Product[]) =>
  Layer.succeed(ProductRepository, { list: () => Effect.succeed(products) })

/**
 * In-memory session reader for tests: a request is signed in when its
 * `x-test-role` header holds a role.
 */
export const sessionReaderInMemory = () =>
  Layer.succeed(SessionReader, {
    read: (headers) =>
      Effect.sync(() => {
        const role = headers.get("x-test-role")
        if (role !== "admin" && role !== "customer") return null
        return sessionFor(role)
      }),
  })

export function sessionFor(role: Role): Session {
  return { userId: `user-${role}`, email: `${role}@example.com`, name: role, role }
}

/** A tiny fixture catalog. */
export const sampleProducts: readonly Product[] = [
  { id: "p2", name: "Mug", description: "A mug", price: money(1299), stock: 5 },
  { id: "p1", name: "apple", description: "An apple", price: money(150), stock: 100 },
]
