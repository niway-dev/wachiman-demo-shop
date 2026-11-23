import { type Contract } from "@demo-shop/api-contract"
import { DEMO_USERS } from "@demo-shop/infra-auth"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import type { ShopApp } from "./app.ts"

/** The demo account with a role. */
export function demoUser(role: "admin" | "customer") {
  const user = DEMO_USERS.find((candidate) => candidate.role === role)
  if (!user) throw new Error(`No demo user with role ${role}`)
  return user
}

/** Signs in through the real auth endpoint and returns the session cookie. */
export async function signInCookie(shop: ShopApp, email: string, password: string) {
  const response = await shop.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: shop.config.webOrigin },
    body: JSON.stringify({ email, password }),
  })
  if (response.status !== 200) throw new Error(`Sign-in failed with ${response.status}`)
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

/**
 * A typed oRPC client wired straight to the app (no network). `statuses`
 * records the HTTP status of every response so a test can assert on 401/403.
 */
export function createTestClient(shop: ShopApp, cookie?: string) {
  const statuses: number[] = []
  const link = new RPCLink({
    url: "http://localhost/rpc",
    headers: cookie ? { cookie } : {},
    fetch: async (request) => {
      const response = await shop.app.fetch(request)
      statuses.push(response.status)
      return response
    },
  })
  const client: ContractRouterClient<Contract> = createORPCClient(link)
  return { client, statuses }
}

/** A typed client signed in as the demo user with `role`. */
export async function clientFor(shop: ShopApp, role: "admin" | "customer") {
  const user = demoUser(role)
  return createTestClient(shop, await signInCookie(shop, user.email, user.password))
}
