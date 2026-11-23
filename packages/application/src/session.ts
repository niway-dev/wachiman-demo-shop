import { canUseAdminRoutes } from "@demo-shop/domain"
import { Effect } from "effect"
import { Forbidden, Unauthenticated } from "./errors.ts"
import { SessionReader } from "./ports.ts"

/** Use case: the session of a request, or `null` for a visitor. */
export const getSession = (headers: Headers) =>
  Effect.gen(function* () {
    const reader = yield* SessionReader
    return yield* reader.read(headers)
  })

/** Use case: the session of a request; fails with `Unauthenticated` when there is none. */
export const requireSession = (headers: Headers) =>
  Effect.gen(function* () {
    const session = yield* getSession(headers)
    if (session === null) return yield* new Unauthenticated()
    return session
  })

/**
 * Use case: the session of an admin. Fails with `Unauthenticated` when there is
 * no session and with `Forbidden` when the role is not allowed to use admin
 * routes. This is the single place the role rule is enforced for the api.
 */
export const requireAdmin = (headers: Headers) =>
  Effect.gen(function* () {
    const session = yield* requireSession(headers)
    if (!canUseAdminRoutes(session.role)) return yield* new Forbidden({ role: session.role })
    return session
  })
