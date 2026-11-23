import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import type { ShopDatabase } from "@demo-shop/infra-db"
import { schema } from "@demo-shop/infra-db"

export interface AuthOptions {
  /** The shop database. better-auth stores its tables in the same SQLite file. */
  readonly db: ShopDatabase
  /** Signs session cookies. At least 32 random characters. */
  readonly secret: string
  /** The public origin the browser talks to (the web app). */
  readonly baseURL: string
  /** Origins allowed to call the auth endpoints besides `baseURL`. */
  readonly trustedOrigins?: readonly string[]
}

/**
 * Builds better-auth over the shop's drizzle database. The user, session,
 * account and verification tables are defined in `infra-db`'s schema, so one
 * migration set creates them; the drizzle adapter reads and writes them.
 * Email and password sign-in is on. `role` is a user column that a sign-up
 * request cannot set (`input: false`): new accounts are customers, and only a
 * direct database update makes an admin.
 */
export function createAuth(options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [...(options.trustedOrigins ?? [])],
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "customer", input: false },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
