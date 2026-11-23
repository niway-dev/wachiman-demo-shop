import type { Role } from "@demo-shop/domain"
import { schema, type ShopDatabase } from "@demo-shop/infra-db"
import { eq } from "drizzle-orm"
import type { Auth } from "./auth.ts"

export interface DemoUser {
  readonly name: string
  readonly email: string
  /** A throwaway password for local demos. It protects nothing. */
  readonly password: string
  readonly role: Role
}

/** The two accounts `bun run db:reset` creates. The passwords are public on purpose. */
export const DEMO_USERS: readonly DemoUser[] = [
  { name: "Demo Admin", email: "admin@example.com", password: "admin-demo-pass", role: "admin" },
  {
    name: "Demo Customer",
    email: "customer@example.com",
    password: "customer-demo-pass",
    role: "customer",
  },
]

/**
 * Creates the demo accounts through better-auth's own sign-up (so the password
 * is hashed the way sign-in expects) and then sets each role directly in the
 * database, because a sign-up request cannot choose a role.
 */
export async function seedDemoUsers(auth: Auth, db: ShopDatabase): Promise<void> {
  for (const demo of DEMO_USERS) {
    await auth.api.signUpEmail({
      body: { name: demo.name, email: demo.email, password: demo.password },
    })
    db.update(schema.user).set({ role: demo.role }).where(eq(schema.user.email, demo.email)).run()
  }
}
