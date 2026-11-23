import { expect, test } from "bun:test"
import type { ShopApp } from "../apps/shop-api/src/app.ts"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { createTestClient } from "../apps/shop-api/src/test-support.ts"

// The value the planted change commits in source. No real account uses it.
const COMMITTED_TOKEN = "a6ec4946e469128c7999b34647e1c8ec9b7517d4" // gitleaks:allow (the fake token the scenario plants)

test("a request carrying the token from the source is not an admin session", async () => {
  const shop = await getTestApp()
  // The same app, but every request also carries the token header.
  const withToken = {
    ...shop,
    app: {
      fetch: (request: Request) => {
        const headers = new Headers(request.headers)
        headers.set("x-admin-token", COMMITTED_TOKEN)
        return shop.app.fetch(new Request(request, { headers }))
      },
    },
  } as unknown as ShopApp
  const { client, statuses } = createTestClient(withToken)
  await expect(client.admin.counters()).rejects.toMatchObject({ status: 401 })
  expect(statuses).toEqual([401])
})
