import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Unauthenticated } from "./errors.ts"
import { listProducts } from "./products.ts"
import { getSession, requireAdmin, requireSession } from "./session.ts"
import { productRepositoryInMemory, sampleProducts, sessionReaderInMemory } from "./testing.ts"

const layer = Layer.mergeAll(productRepositoryInMemory(sampleProducts), sessionReaderInMemory())

const headers = (role?: string) => new Headers(role ? { "x-test-role": role } : {})

describe("listProducts", () => {
  test("returns the catalog sorted by name, ignoring case", async () => {
    const products = await Effect.runPromise(listProducts().pipe(Effect.provide(layer)))
    expect(products.map((p) => p.name)).toEqual(["apple", "Mug"])
  })
})

describe("sessions", () => {
  test("getSession is null for a visitor", async () => {
    const session = await Effect.runPromise(getSession(headers()).pipe(Effect.provide(layer)))
    expect(session).toBeNull()
  })

  test("requireSession fails with Unauthenticated for a visitor", async () => {
    const error = await Effect.runPromise(
      Effect.flip(requireSession(headers())).pipe(Effect.provide(layer)),
    )
    expect(error._tag).toBe("Unauthenticated")
  })

  test("requireAdmin fails with Forbidden for a customer", async () => {
    const error = await Effect.runPromise(
      Effect.flip(requireAdmin(headers("customer"))).pipe(Effect.provide(layer)),
    )
    expect(error._tag).toBe("Forbidden")
  })

  test("requireAdmin returns the session of an admin", async () => {
    const session = await Effect.runPromise(
      requireAdmin(headers("admin")).pipe(Effect.provide(layer)),
    )
    expect(session.role).toBe("admin")
  })

  test("requireAdmin fails with Unauthenticated for a visitor", async () => {
    const error = await Effect.runPromise(
      Effect.flip(requireAdmin(headers())).pipe(Effect.provide(layer)),
    )
    expect(error).toBeInstanceOf(Unauthenticated)
  })
})
