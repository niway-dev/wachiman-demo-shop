import { RepositoryError, type Session, SessionReader } from "@demo-shop/application"
import { isRole } from "@demo-shop/domain"
import { Effect, Layer } from "effect"
import type { Auth } from "./auth.ts"

/**
 * Adapter: the `SessionReader` port over better-auth. A request without a
 * valid session cookie reads as `null`. An unknown role value is treated as
 * `customer`, the least privileged role.
 */
export const SessionReaderLive = (auth: Auth) =>
  Layer.succeed(SessionReader, {
    read: (headers) =>
      Effect.tryPromise({
        try: async (): Promise<Session | null> => {
          const result = await auth.api.getSession({ headers })
          if (!result) return null
          const role = (result.user as { role?: unknown }).role
          return {
            userId: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: isRole(role) ? role : "customer",
          }
        },
        catch: (cause) => new RepositoryError({ cause }),
      }),
  })
