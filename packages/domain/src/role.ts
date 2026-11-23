/** The two roles an account can have. */
export const ROLES = ["admin", "customer"] as const

export type Role = (typeof ROLES)[number]

/** Rule: a value is a role only when it is exactly one of `ROLES`. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}

/**
 * Rule: only an admin may use admin routes. A missing or unknown role is
 * treated as not an admin; the api calls this, the UI never decides alone.
 */
export function canUseAdminRoutes(role: unknown): boolean {
  return role === "admin"
}
